const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    titleEn: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    duration: {
        type: String,
        required: true
    },
    audioUrl: {
        type: String,
        required: true
    },
    isClassical: {
        type: Boolean,
        default: false
    },
    classicalInfo: {
        composer: String,
        opusNumber: String,
        movement: String,
        tempo: String
    }
});

const albumSchema = new mongoose.Schema({
    albumTitle: {
        type: String,
        required: true
    },
    nameEn: {
        type: String,
        required: true
    },
    nameKana: {
        type: String,
        required: true
    },
    artistInfo: {
        type: String,
        required: true
    },
    isReleased: {
        type: Boolean,
        default: false
    },
    imageUrl: {
        type: String,
        required: true
    },
    genre: {
        type: String,
        required: true
    },
    youtubeMonetize: {
        type: Boolean,
        required: true
    },
    songs: [songSchema],
    status: {
        type: String,
        enum: ['処理中', '完了', 'エラー'],
        default: '処理中'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 저장 전 날짜 유효성 검사
albumSchema.pre('save', function(next) {
    if (!this.date || isNaN(this.date.getTime())) {
        return next(new Error('保存に失敗：無効な日付です'));
    }
    
    const year = this.date.getFullYear();
    if (year < 1900 || year > 2100) {
        return next(new Error('保存に失敗：日付が範囲外です (1900-2100)'));
    }
    
    next();
});

module.exports = mongoose.model('Album', albumSchema, 'albums-jp');