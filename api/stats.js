const sql = require('../lib/db');
const { requireAuth } = require('../lib/auth');

function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    if (req.method === 'GET') {
        try {
            const totalPatientsResult = await sql`SELECT COUNT(*) FROM patients`;
            const totalVisitsResult = await sql`SELECT COUNT(*) FROM visits`;
            const totalRevenueResult = await sql`SELECT SUM(payment) FROM visits`;
            const totalOldRecordsResult = await sql`SELECT COUNT(*) FROM old_records`;
            
            const recentPatients = await sql`
                SELECT * FROM patients 
                ORDER BY id DESC 
                LIMIT 5
            `;

            const today = getTodayFormatted();
            const todayAppointments = await sql`
                SELECT v.*, p.name as patient_name, p.case_no 
                FROM visits v
                JOIN patients p ON v.patient_id = p.id
                WHERE v.visit_date = ${today} 
                   OR v.next_appointment_date = ${today}
                ORDER BY v.visit_time ASC
            `;

            return res.json({
                totalPatients: parseInt(totalPatientsResult[0].count),
                totalVisits: parseInt(totalVisitsResult[0].count),
                totalRevenue: parseInt(totalRevenueResult[0].sum || 0),
                totalOldRecords: parseInt(totalOldRecordsResult[0].count),
                recentPatients,
                todayAppointments
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
