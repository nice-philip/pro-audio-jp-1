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
        type: String,
        required: true
    },
    albumDescription: String,
    note: String,
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
        default: '처리중'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Album', albumSchema); 