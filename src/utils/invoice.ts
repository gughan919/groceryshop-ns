export const generateAndUploadInvoice = async (order: any, token: string) => {
  if (!order?.id || !token) return null;

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/invoice/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Invoice generation failed.');
    }

    return data.invoiceUrl || data.order?.invoiceUrl || null;
  } catch (error) {
    console.error('Invoice generation request failed:', error);
    return null;
  }
};
