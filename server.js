const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const clientsRouter = require('./api/clients');
const loginRouter = require('./api/login');
const loansRouter = require('./api/loans');
const uploadSignedPhotoRoutes = require('./api/upload-signed-photo');
const customerInfoRoutes = require('./api/customer-info');

const app = express();
app.use(cors());
app.use(bodyParser.json());
// Serve static uploads under the `/uploads` path and the frontend `public` directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// 用户相关接口分离
app.use('/api/clients', clientsRouter);
app.use('/api/login', loginRouter);
app.use('/api/loans', loansRouter);
app.use('/api/upload-signed-photo', uploadSignedPhotoRoutes);
app.use('/api/customer-info', customerInfoRoutes);

// 其他路由可继续分离
// const loansRouter = require('./routes/loans');
// app.use('/api/loans', loansRouter);

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
