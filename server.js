const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const uploadRouter = require('./upload');
const Album = require('./models/Album');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected successfully');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 라우터 설정
app.use('/api/upload', uploadRouter);

// 데이터베이스 상태 확인
app.get('/api/status', async (req, res) => {
    try {
        const count = await Album.countDocuments();
        res.json({
            status: 'ok',
            message: 'データベース接続正常',
            albumCount: count
        });
    } catch (error) {
        console.error('Database check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'データベース接続エラー',
            error: error.message
        });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 