const express = require('express');
const app = express();

app.use(express.json());

// Helper to bridge Express and Vercel handlers
const bridge = (handler, paramName) => (req, res) => {
    if (paramName) {
        req.query[paramName] = req.params[paramName];
    }
    return handler(req, res);
};

// Auth
app.all('/auth/google', bridge(require('./auth/google')));
app.all('/auth/google/callback', bridge(require('./auth/callback')));
app.all('/auth/logout', bridge(require('./auth/logout')));
app.all('/api/auth/me', bridge(require('./auth/me')));
app.all('/api/me', bridge(require('./auth/me')));

// Backup
app.all('/api/backup/download', bridge(require('./backup/download')));

// Dashboard
app.all('/api/dashboard', bridge(require('./dashboard')));

// Old Records
app.all('/api/old-records', bridge(require('./old-records/index')));
app.all('/api/old-records/upload', bridge(require('./old-records/index')));
app.all('/api/old-records/:id', bridge(require('./old-records/[id]'), 'id'));

// Patients
app.all('/api/patients', bridge(require('./patients/index')));
app.all('/api/patients/:id', bridge(require('./patients/[id]'), 'id'));

// Payments
app.all('/api/payments', bridge(require('./payments')));

// Stats
app.all('/api/stats', bridge(require('./stats')));

// Treatments
app.all('/api/treatments', bridge(require('./treatments/index')));
app.all('/api/treatments/:id', bridge(require('./treatments/[id]'), 'id'));
app.all('/api/treatments/:id/pdf', bridge(require('./treatments/[id]/pdf'), 'id'));

// Visits
app.all('/api/visits', bridge(require('./visits/index')));
app.all('/api/visits/today', bridge(require('./visits/today')));
app.all('/api/visits/upcoming', bridge(require('./visits/upcoming')));
app.all('/api/visits/:id', bridge(require('./visits/[id]'), 'id'));

module.exports = app;
