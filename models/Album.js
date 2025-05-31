const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        required: true
    },
    gender: {
        type: String,
        enum: ['男', '女', '其他'], // ✅ 중국어 값 허용
        required: true
    },
    email: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    albumLength: {
        type: String, // ✅ "오후 04:01" 형식도 받을 수 있게 String으로
        required: true
    },
    albumDescription: {
        type: String
    },
    note: {
        type: String
    },
    reservationCode: {
        type: String,
        required: true
    },
    audioUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: '处理中'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Album', albumSchema);