const sql = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');
const PDFDocument = require('pdfkit');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    const { id } = req.query;
    const treatmentId = parseInt(id);

    try {
        const treatments = await sql`
            SELECT t.*, p.name as patient_name, p.case_no, p.age, p.sex, p.phone, p.address, p.referred_by, p.referrer_phone, p.created_date as reg_date
            FROM treatments t
            JOIN patients p ON t.patient_id = p.id
            WHERE t.id = ${treatmentId}
        `;

        if (treatments.length === 0) return res.status(404).json({ error: 'Treatment not found' });
        const treatment = treatments[0];

        const sittings = await sql`
            SELECT * FROM visits 
            WHERE treatment_id = ${treatmentId} 
            ORDER BY id ASC
        `;

        const safe = (s) => (s == null || s === '' ? '-' : String(s).toUpperCase());
        const safeFilename = (s) => (s || 'REPORT').toUpperCase().replace(/[^A-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 80);
        const colCharLimits = [8, 6, 14, 11, 8, 10, 11];
        const truncate = (str, maxChars) => { const s = String(str || '-').toUpperCase(); return s.length <= maxChars ? s : s.slice(0, maxChars - 2) + '..'; };
        const filename = `${safeFilename(treatment.patient_name)}_${safeFilename(treatment.name)}_REPORT.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 40, bufferPages: false });
        doc.pipe(res);

        const margin = 40;
        const pageWidth = doc.page.width - margin * 2;
        let y = margin;

        doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text("VIMISHA'S DENTAL CLINIC", margin, y, { align: 'center' });
        y += 22;
        doc.fontSize(10).font('Helvetica').text('TREATMENT CASE RECORD', margin, y, { align: 'center' });
        y += 20;

        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).strokeColor('#000000').lineWidth(1).stroke();
        y += 15;

        doc.fontSize(10).font('Helvetica-Bold').text('PATIENT INFORMATION', margin, y);
        y += 15;

        const col1X = margin;
        const col2X = margin + (pageWidth / 2);
        let sectionY = y;

        const leftSide = [
            ['NAME', treatment.patient_name],
            ['CASE NO.', treatment.case_no],
            ['AGE / SEX', `${treatment.age || '-'} / ${treatment.sex === 'M' ? 'MALE' : treatment.sex === 'F' ? 'FEMALE' : (treatment.sex || '-')}`],
            ['PHONE', treatment.phone]
        ];
        const rightSide = [
            ['ADDRESS', treatment.address],
            ['REFERRED BY', [treatment.referred_by, treatment.referrer_phone ? `(${treatment.referrer_phone})` : ''].filter(Boolean).join(' ')],
            ['REG. DATE', treatment.reg_date]
        ];

        doc.font('Helvetica');
        leftSide.forEach(([label, val]) => {
            doc.font('Helvetica-Bold').text(`${label}: `, col1X, sectionY, { continued: true });
            doc.font('Helvetica').text(safe(val));
            sectionY += 14;
        });

        let sectionY2 = y;
        rightSide.forEach(([label, val]) => {
            doc.font('Helvetica-Bold').text(`${label}: `, col2X, sectionY2, { continued: true });
            doc.font('Helvetica').text(safe(val));
            sectionY2 += 14;
        });

        y = Math.max(sectionY, sectionY2) + 20;

        doc.font('Helvetica-Bold').fontSize(11).text('TREATMENT:', margin, y, { continued: true });
        doc.font('Helvetica').text(` ${safe(treatment.name)}`);
        y += 14;
        if (treatment.description) {
            doc.font('Helvetica-Bold').text('REMARKS:', margin, y, { continued: true });
            doc.font('Helvetica').text(` ${safe(treatment.description)}`);
            y += 14;
        }
        y += 15;

        doc.font('Helvetica-Bold').fontSize(11).text('SITTINGS / VISIT RECORDS', margin, y);
        y += 15;

        const headers = ['DATE', 'TIME', 'WORK DONE', 'FINDINGS', 'PAYMENT', 'NEXT APPT', 'NOTES'];
        const colWidths = [50, 40, 95, 80, 55, 65, 130];
        const rowHeight = 20;

        doc.rect(margin, y, pageWidth, rowHeight).stroke();
        let currentX = margin;
        doc.fontSize(8);
        headers.forEach((h, i) => {
            doc.text(h, currentX + 4, y + 6, { width: colWidths[i] - 8 });
            currentX += colWidths[i];
        });
        y += rowHeight;

        sittings.forEach((s, idx) => {
            if (y > doc.page.height - 60) {
                doc.addPage();
                y = margin;
            }

            const paymentStr = s.payment ? 'RS.' + Number(s.payment).toLocaleString('en-IN') : '-';
            const nextApptStr = s.next_appointment_date ? safe(s.next_appointment_date) : '-';
            const cells = [safe(s.visit_date), safe(s.visit_time), safe(s.work_done), safe(s.findings), paymentStr, nextApptStr, safe(s.notes)];

            doc.rect(margin, y, pageWidth, rowHeight).stroke();
            currentX = margin;
            cells.forEach((cell, ci) => {
                doc.text(truncate(cell, colCharLimits[ci]), currentX + 4, y + 6, { width: colWidths[ci] - 8 });
                currentX += colWidths[ci];
            });
            y += rowHeight;
        });

        const footerY = doc.page.height - 40;
        doc.fontSize(8).fillColor('#666666');
        doc.text(`PRINTED ON: ${new Date().toLocaleString('en-IN').toUpperCase()}`, margin, footerY);
        doc.text(`PAGE RECORD — VIMISHA'S DENTAL CLINIC`, margin, footerY, { align: 'right' });

        doc.end();
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed', detail: err.message });
    }
};
