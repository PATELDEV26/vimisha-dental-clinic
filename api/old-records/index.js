const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const cloudinary = require('../../lib/cloudinary');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }
});

function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

// Helper to run middleware
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    if (req.method === 'GET') {
        try {
            const records = await sql`
                SELECT * FROM old_records 
                ORDER BY id DESC 
                LIMIT 200
            `;
            return res.json(records);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'POST') {
        try {
            await runMiddleware(req, res, upload.array('photos', 50));

            const { patient_id, patient_name_manual, case_no, record_date, description } = req.body || {};
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'At least one photo is required' });
            }

            const uploadDate = getTodayFormatted();
            const results = [];
            let linkedPatientId = patient_id ? parseInt(patient_id, 10) : null;

            // If manual name provided and no existing patient linked, create a new patient
            if (!linkedPatientId && patient_name_manual) {
                const newPatient = await sql`
                    INSERT INTO patients (name, created_date) 
                    VALUES (${patient_name_manual.toUpperCase()}, ${uploadDate}) 
                    RETURNING id
                `;
                linkedPatientId = newPatient[0].id;
            }

            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString('base64');
                const dataURI = `data:${file.mimetype};base64,${b64}`;
                
                const cloudRes = await cloudinary.uploader.upload(dataURI, {
                    folder: 'vimisha-dental/old-records'
                });

                const record = await sql`
                    INSERT INTO old_records 
                    (patient_id, patient_name_manual, case_no, record_date, upload_date, description, file_path)
                    VALUES (${linkedPatientId}, ${patient_name_manual}, ${case_no}, ${record_date}, ${uploadDate}, 
                            ${description}, ${cloudRes.secure_url})
                    RETURNING id
                `;
                results.push(record[0]);
            }

            return res.json({ 
                message: `${req.files.length} record(s) uploaded successfully`,
                ids: results.map(r => r.id),
                patient_id: linkedPatientId
            });

        } catch (err) {
            console.error('Upload error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};

// Disable body parsing for multer
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
