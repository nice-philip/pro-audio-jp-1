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
        required: false
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
        required: true,
        enum: ['pop', 'rock', 'jazz', 'classical', 'electronic', 'hiphop', 'rb', 'folk', 'world', 'ambient', 'metal', 'blues', 'country', 'experimental', 'fusion']
    },
    youtubeMonetize: {
        type: String,
        required: true,
        enum: ['yes', 'no']
    },
    youtubeAgree: {
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
    // 날짜가 있는 곡들만 검증
    const invalidDates = this.songs.filter(song => 
        song.date && (
            isNaN(song.date.getTime()) || 
            song.date.getFullYear() < 1900 || 
            song.date.getFullYear() > 2100
        )
    );

    if (invalidDates.length > 0) {
        return next(new Error('保存に失敗：無効な日付があります'));
    }
    
    next();
});

module.exports = mongoose.model('Album', albumSchema, 'albums-jp');