const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const clientsRouter = require('./api/clients');
const loginRouter = require('./api/login');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('uploads'));

// 用户相关接口分离
app.use('/api/clients', clientsRouter);
app.use('/api/login', loginRouter);

// 其他路由可继续分离
// const loansRouter = require('./routes/loans');
// app.use('/api/loans', loansRouter);

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
