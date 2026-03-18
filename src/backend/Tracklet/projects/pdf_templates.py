"""PDF templates for Projects reports."""

from io import BytesIO

from django.utils import timezone


def build_broken_report_pdf(*, project, report, title, report_date, items):
    """Build the standard Broken Report PDF document."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    report_title = str(title or '').strip() or 'Broken Items Inventory Report'

    def draw_footer(canvas, doc):
        """Render page footer and document metadata."""
        canvas.saveState()
        canvas.setTitle(report_title)
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.grey)
        canvas.drawRightString(
            doc.pagesize[0] - 15 * mm,
            10 * mm,
            f'Page {canvas.getPageNumber()}',
        )
        canvas.restoreState()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()

    created_date = (
        report.created.date().isoformat()
        if report and report.created
        else timezone.now().date().isoformat()
    )
    created_by = ''
    if report and report.created_by:
        created_by = getattr(report.created_by, 'username', '') or str(report.created_by)
    project_code = getattr(project, 'reference', None) or f'PRJ-{project.pk}'
    date_line = report_date or created_date

    rows = [[
        'Instrument',
        'Quantity',
        'Usage/Notes',
        'Manufacturer',
        'Model',
        'SN',
        'Type',
        'Specification',
        'Located',
    ]]

    for item in items:
        instrument_name = ''
        quantity = str(getattr(item, 'quantity', 1) or 1)
        manufacturer = item.manufacture or ''
        model = item.model or ''
        serial = item.sn or ''
        part_type = item.type or ''
        specification = item.specification or ''
        located = item.located or ''
        usage_notes = item.note or ''

        if getattr(item, 'instrument_id', None):
            inst = item.instrument
            stock_item = getattr(inst, 'stock_item', None)
            part = getattr(stock_item, 'part', None)

            if (
                not manufacturer
                and stock_item is not None
                and stock_item.supplier_part is not None
                and stock_item.supplier_part.manufacturer_part is not None
                and stock_item.supplier_part.manufacturer_part.manufacturer is not None
            ):
                manufacturer = (
                    stock_item.supplier_part.manufacturer_part.manufacturer.name or ''
                )
            if not model and part is not None:
                model = part.full_name or ''
            if not serial and stock_item is not None and getattr(stock_item, 'serial', None):
                serial = stock_item.serial
            if not part_type and part is not None and getattr(part, 'category', None):
                part_type = part.category.name or ''
            if not specification and part is not None:
                specification = part.description or ''
            if (
                not located
                and stock_item is not None
                and getattr(stock_item, 'location', None) is not None
            ):
                located = stock_item.location.pathstring or ''

            if part:
                instrument_name = str(getattr(part, 'full_name', '') or getattr(part, 'name', ''))
            if stock_item and getattr(stock_item, 'serial', None):
                instrument_name = f'{instrument_name} #{stock_item.serial}'.strip()
            if not getattr(item, 'quantity', None):
                quantity = str(getattr(inst, 'quantity', 1) or 1)

        if not instrument_name:
            instrument_name = model or f'Instrument Item {item.pk}'

        rows.append([
            instrument_name,
            quantity,
            usage_notes,
            manufacturer,
            model,
            serial,
            part_type,
            specification,
            located,
        ])

    # Widths sum to usable A4 width (~182mm with margins above)
    table = Table(
        rows,
        repeatRows=1,
        colWidths=[24 * mm, 14 * mm, 24 * mm, 18 * mm, 24 * mm, 16 * mm, 14 * mm, 30 * mm, 18 * mm],
    )
    table.setStyle(
        TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E9ECEF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#ADB5BD')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ])
    )

    elements = [
        Paragraph(report_title, styles['Title']),
        Spacer(1, 4),
        Paragraph(f'Project: {project.name}', styles['Normal']),
        Paragraph(f'Project Code: {project_code}', styles['Normal']),
        Paragraph(f'Report Created Date: {date_line}', styles['Normal']),
        Paragraph(f'Created By: {created_by or "-"}', styles['Normal']),
        Spacer(1, 8),
        table,
    ]

    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
