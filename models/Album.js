const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, '名前は必須項目です']
    },
    age: {
        type: Number,
        required: [true, '年齢は必須項目です'],
        min: [1, '年齢は0より大きい必要があります'],
        max: [150, '年齢が範囲外です']
    },
    gender: {
        type: String,
        enum: ['男性', '女性', 'その他'],
        required: [true, '性別は必須項目です']
    },
    email: {
        type: String,
        required: [true, 'メールアドレスは必須項目です'],
        match: [/^\S+@\S+\.\S+$/, 'メールアドレスの形式が正しくありません']
    },
    date: {
        type: Date,
        required: [true, '日付は必須項目です'],
        validate: {
            validator: function(value) {
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    return false;
                }
                const year = date.getFullYear();
                return year >= 1900 && year <= 2100;
            },
            message: '無効な日付形式または日付が範囲外です (1900-2100)'
        },
        set: function(value) {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                return new Date(value);
            } else if (typeof value === 'string') {
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    throw new Error('無効な日付形式です');
                }
                return date;
            }
            return value;
        }
    },
    albumLength: {
        type: String,
        required: [true, '時間は必須項目です'],
        validate: {
            validator: function(v) {
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
            },
            message: '時間形式はHH:mm:ssである必要があります'
        }
    },
    albumDescription: {
        type: String,
        maxlength: [1000, '説明は1000文字を超えることはできません']
    },
    note: {
        type: String,
        maxlength: [500, 'メモは500文字を超えることはできません']
    },
    reservationCode: {
        type: String,
        required: [true, '予約番号は必須項目です']
    },
    audioUrl: {
        type: String,
        required: [true, '音声URLは必須項目です']
    },
    status: {
        type: String,
        enum: ['処理中', '完了', 'キャンセル'],
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