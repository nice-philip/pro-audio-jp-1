const mongoose = require('mongoose');

const AlbumSchema = new mongoose.Schema({
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
        enum: ['남', '여', '기타'],
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
        type: String, // e.g. '00:45' 형식 (string 처리)
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
        required: true,
        index: true
    },
    audioUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['처리중', '완료됨', '취소됨'],
        default: '처리중'
    }
}, {
    timestamps: true // ✅ createdAt, updatedAt 자동 관리
});

module.exports = mongoose.model('Album', AlbumSchema);