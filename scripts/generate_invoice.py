import json
import sys
import urllib.request
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REQUIRED_ORDER_FIELDS = [
    "id",
    "userEmail",
    "items",
    "subtotal",
    "discount",
    "deliveryFee",
    "tax",
    "total",
    "paymentStatus",
    "paymentMethod",
    "address",
]

REQUIRED_ADDRESS_FIELDS = ["fullName", "street", "city", "state", "pincode", "phone"]


def money(value):
    return f"£{float(value or 0):.2f}"


def validate_order(order):
    missing = [field for field in REQUIRED_ORDER_FIELDS if field not in order or order[field] in (None, "")]
    if missing:
        raise ValueError(f"Missing order fields: {', '.join(missing)}")

    address = order.get("address") or {}
    missing_address = [field for field in REQUIRED_ADDRESS_FIELDS if not address.get(field)]
    if missing_address:
        raise ValueError(f"Missing customer/address fields: {', '.join(missing_address)}")

    if not isinstance(order.get("items"), list) or len(order["items"]) == 0:
        raise ValueError("Product list is empty")

    for index, item in enumerate(order["items"], start=1):
        for field in ["productName", "quantity", "price"]:
            if item.get(field) in (None, ""):
                raise ValueError(f"Missing {field} on product row {index}")

    if order.get("paymentStatus") != "Paid":
        raise ValueError("Invoice generation requires Paid payment status")


def image_from_url(url, width=18 * mm, height=18 * mm):
    if not url or not str(url).startswith(("http://", "https://")):
        return ""
    try:
        req = urllib.request.Request(str(url), headers={"User-Agent": "Nammashop-Invoice/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = response.read(1024 * 1024)
        return Image(BytesIO(data), width=width, height=height)
    except Exception:
        return ""


def build_invoice(order, output_path):
    validate_order(order)

    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontName = "Helvetica"
    normal.fontSize = 9
    normal.leading = 12
    bold = styles["Heading4"]
    bold.fontName = "Helvetica-Bold"
    bold.textColor = colors.HexColor("#111827")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Invoice {order['id']}",
    )

    invoice_id = f"INV-{order['id']}"
    created_at = order.get("createdAt") or datetime.utcnow().isoformat()
    try:
        invoice_date = datetime.fromisoformat(created_at.replace("Z", "+00:00")).strftime("%d %b %Y, %H:%M")
    except Exception:
        invoice_date = datetime.utcnow().strftime("%d %b %Y, %H:%M")

    address = order["address"]
    story = []

    logo = image_from_url(order.get("storeLogoUrl"), width=22 * mm, height=22 * mm)
    header_left = [
        logo or Paragraph("<b>N</b>", styles["Title"]),
        Paragraph("<b>NammaShop UK</b><br/>Premium grocery delivery<br/>123 Eco Street, Greenway District<br/>London, UK - SW1A 1AA<br/>support@nammashop.eco | +44 20 7000 0000", normal),
    ]
    header_right = Paragraph(
        f"<b>INVOICE</b><br/>Invoice ID: {invoice_id}<br/>Order ID: {order['id']}<br/>Date: {invoice_date}<br/>Payment: {order['paymentMethod']}",
        normal,
    )
    header = Table([[header_left[0], header_left[1], header_right]], colWidths=[26 * mm, 84 * mm, 68 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header)
    story.append(Spacer(1, 5 * mm))

    customer = Paragraph(
        f"<b>Customer</b><br/>{address['fullName']}<br/>{order['userEmail']}<br/>{address['phone']}<br/>{address['street']}<br/>{address['city']}, {address['state']} - {address['pincode']}",
        normal,
    )
    order_meta = Paragraph(
        f"<b>Order</b><br/>Order ID: {order['id']}<br/>Invoice ID: {invoice_id}<br/>Payment status: {order['paymentStatus']}<br/>Delivery estimate: {order.get('deliveryEstimate') or 'Express delivery window'}",
        normal,
    )
    info = Table([[customer, order_meta]], colWidths=[89 * mm, 89 * mm])
    info.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(info)
    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("Products", bold))

    rows = [["Image", "Product", "Qty", "Unit price", "Discount", "Total"]]
    for item in order["items"]:
        quantity = float(item.get("quantity") or 0)
        unit_price = float(item.get("price") or 0)
        line_total = quantity * unit_price
        rows.append([
            image_from_url(item.get("productImage")),
            Paragraph(f"<b>{item.get('productName')}</b><br/>{item.get('unit', 'Unit')}", normal),
            str(int(quantity) if quantity.is_integer() else quantity),
            money(unit_price),
            f"{float(item.get('discount') or 0):.0f}%",
            money(line_total),
        ])

    table = Table(rows, colWidths=[21 * mm, 64 * mm, 16 * mm, 25 * mm, 20 * mm, 28 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#10B981")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(Spacer(1, 7 * mm))

    summary_rows = [
        ["Subtotal", money(order["subtotal"])],
        ["Discount", f"-{money(order.get('discount', 0))}"],
        ["Delivery charge", money(order.get("deliveryFee", 0))],
        ["Tax", money(order.get("tax", 0))],
        ["Grand total", money(order["total"])],
        ["Payment status", order["paymentStatus"]],
        ["Payment method", order["paymentMethod"]],
    ]
    summary = Table(summary_rows, colWidths=[44 * mm, 34 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E5E7EB")),
        ("FONTNAME", (0, 4), (-1, 4), "Helvetica-Bold"),
        ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#ECFDF5")),
        ("TEXTCOLOR", (0, 4), (-1, 4), colors.HexColor("#047857")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(summary)
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph("Thank you for shopping with NammaShop UK. For invoice help, contact support@nammashop.eco or +44 20 7000 0000.", normal))

    doc.build(story)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: generate_invoice.py <order-json> <output-pdf>")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        order = json.load(handle)
    build_invoice(order, sys.argv[2])
    print(json.dumps({"success": True, "output": sys.argv[2]}))


if __name__ == "__main__":
    main()
