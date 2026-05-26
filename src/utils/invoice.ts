import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export const generateAndUploadInvoice = async (order: any, token: string) => {
  try {
    const doc = new jsPDF();
    
    // Header section
    doc.setFontSize(24);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.setFont("helvetica", "bold");
    doc.text("NAMMASHOP", 14, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont("helvetica", "normal");
    doc.text("Fresh Quick-Commerce & Grocery Network", 14, 32);
    doc.text("123 Eco Street, Greenway District", 14, 38);
    doc.text("London, UK - SW1A 1AA", 14, 44);
    doc.text("support@nammashop.eco | +44 20 7000 0000", 14, 50);

    // Invoice details (Right aligned)
    doc.setFontSize(20);
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", 140, 25);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Invoice ID:`, 140, 32);
    doc.text(`INV-${order.id.slice(0, 8).toUpperCase()}`, 165, 32);
    
    doc.text(`Order ID:`, 140, 38);
    doc.text(`${order.id.slice(0, 8)}`, 165, 38);
    
    doc.text(`Date Issued:`, 140, 44);
    doc.text(`${new Date(order.createdAt).toLocaleDateString()}`, 165, 44);

    doc.text(`Payment:`, 140, 50);
    doc.text(`${order.paymentMethod}`, 165, 50);

    // Customer section
    doc.setDrawColor(230, 230, 230);
    doc.line(14, 58, 196, 58); // Horizontal line
    
    doc.setFontSize(12);
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    doc.text("Billed To:", 14, 68);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    
    // Customer Name
    const customerName = order.address?.fullName || "Valued Customer";
    doc.text(customerName, 14, 76);
    
    // Customer Contact
    if (order.userEmail) {
      doc.text(`Email: ${order.userEmail}`, 14, 82);
    } else {
      doc.text(`Email: Support Contact Provided`, 14, 82); // Fallback
    }
    
    if (order.address?.phone) {
      doc.text(`Phone: ${order.address.phone}`, 14, 88); 
    }
    
    // Shipping Address
    doc.setFont("helvetica", "bold");
    doc.text("Shipping Address:", 120, 68);
    doc.setFont("helvetica", "normal");
    doc.text(`${order.address?.street || ''}`, 120, 76);
    doc.text(`${order.address?.city || ''}, ${order.address?.state || ''} - ${order.address?.pincode || ''}`, 120, 82);

    // Table
    const tableData = order.items.map((item: any) => [
      item.productName,
      `${item.quantity} ${item.unit || 'units'}`,
      `£${Number(item.price).toFixed(2)}`,
      `£${(Number(item.quantity) * Number(item.price)).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 100,
      head: [['Product Description', 'Quantity', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [16, 185, 129], 
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      styles: { 
        fontSize: 10, 
        cellPadding: 5,
        textColor: [80, 80, 80]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    // Summary Section
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.setFont("helvetica", "normal");
    
    doc.text(`Subtotal:`, 140, finalY);
    doc.text(`£${Number(order.subtotal).toFixed(2)}`, 175, finalY, { align: 'right' });

    if (order.discount && order.discount > 0) {
      doc.text(`Discounts:`, 140, finalY + 8);
      doc.setTextColor(16, 185, 129);
      doc.text(`-£${Number(order.discount).toFixed(2)}`, 175, finalY + 8, { align: 'right' });
      doc.setTextColor(80);
    }

    doc.text(`Delivery Charge:`, 140, finalY + 16);
    const deliveryFee = order.deliveryFee !== undefined ? Number(order.deliveryFee) : 0;
    doc.text(deliveryFee === 0 ? `Free` : `£${deliveryFee.toFixed(2)}`, 175, finalY + 16, { align: 'right' });
    
    doc.text(`Tax (5% VAT):`, 140, finalY + 24);
    const tax = order.tax !== undefined ? Number(order.tax) : 0;
    doc.text(`£${tax.toFixed(2)}`, 175, finalY + 24, { align: 'right' });

    // Grand Total
    doc.setDrawColor(200, 200, 200);
    doc.line(135, finalY + 30, 196, finalY + 30);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129);
    doc.text(`Grand Total:`, 135, finalY + 40);
    doc.text(`£${Number(order.total).toFixed(2)}`, 175, finalY + 40, { align: 'right' });

    // Payment Status
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Payment Status:`, 14, finalY + 40);
    doc.setTextColor(order.paymentStatus === 'Paid' ? 16 : 220, order.paymentStatus === 'Paid' ? 185 : 38, order.paymentStatus === 'Paid' ? 129 : 38);
    doc.text(`${order.paymentStatus.toUpperCase()}`, 45, finalY + 40);

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.setFont("helvetica", "italic");
    doc.text("Thank you for choosing Nammashop! We hope you enjoy your premium groceries.", 105, pageHeight - 30, { align: "center" });
    doc.text("Returns accepted within 24 hours of delivery for fresh produce.", 105, pageHeight - 24, { align: "center" });

    // Get PDF as blob to save
    const pdfBlob = doc.output('blob');
    let downloadUrl = '';

    try {
      // Attempt to save to Firebase Storage
      const invoiceRef = ref(storage, `invoices/${order.userId || 'guest'}/INV-${order.id}.pdf`);
      await uploadBytes(invoiceRef, pdfBlob);
      downloadUrl = await getDownloadURL(invoiceRef);
      
      // Update our backend
      await fetch(`/api/orders/${order.id}/invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ invoiceUrl: downloadUrl })
      });
      console.log("Invoice generated securely in Firebase Storage.");
    } catch (fbError) {
      console.warn("Firebase Storage failed, generating local URL fallback...", fbError);
      // Fallback: Just return local object URL.
      downloadUrl = window.URL.createObjectURL(pdfBlob);
    }
    
    return downloadUrl;
  } catch (err: any) {
    console.error("Invoice generation system failed:", err.message || err);
    return null;
  }
};
