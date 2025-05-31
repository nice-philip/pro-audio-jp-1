const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, '姓名是必填项']
    },
    age: {
        type: Number,
        required: [true, '年龄是必填项'],
        min: [1, '年龄必须大于0'],
        max: [150, '年龄超出范围']
    },
    gender: {
        type: String,
        enum: ['男', '女', '其他'],
        required: [true, '性别是必填项']
    },
    email: {
        type: String,
        required: [true, '邮箱是必填项'],
        match: [/^\S+@\S+\.\S+$/, '邮箱格式不正确']
    },
    date: {
        type: Date,
        required: [true, '日期是必填项'],
        validate: {
            validator: function(value) {
                // ISO 형식이나 Date 객체 모두 허용
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    return false;
                }
                // 날짜 범위 검사 (1900년 ~ 2100년)
                const year = date.getFullYear();
                return year >= 1900 && year <= 2100;
            },
            message: '无效的日期格式或日期超出范围 (1900-2100)'
        },
        set: function(value) {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                // ISO 형식인 경우 그대로 파싱
                return new Date(value);
            } else if (typeof value === 'string') {
                // 다른 문자열 형식의 경우 Date 객체로 변환 시도
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    throw new Error('无效的日期格式');
                }
                return date;
            }
            return value; // Date 객체인 경우 그대로 반환
        }
    },
    albumLength: {
        type: String,
        required: [true, '时间是必填项'],
        validate: {
            validator: function(v) {
                // HH:mm:ss 형식 검사
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
            },
            message: '时间格式必须为 HH:mm:ss'
        }
    },
    albumDescription: {
        type: String,
        maxlength: [1000, '描述不能超过1000字']
    },
    note: {
        type: String,
        maxlength: [500, '备注不能超过500字']
    },
    reservationCode: {
        type: String,
        required: [true, '预约编号是必填项']
            // unique: true // ← 예약코드 중복 금지하고 싶다면 주석 해제
    },
    audioUrl: {
        type: String,
        required: [true, '音频地址是必填项']
    },
    status: {
        type: String,
        enum: ['处理中', '已完成', '已取消'],
        default: '处理中'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 저장 전 날짜 유효성 검사 (추가 안전장치)
albumSchema.pre('save', function(next) {
    if (!this.date || isNaN(this.date.getTime())) {
        return next(new Error('保存失败：无效的日期'));
    }
    
    const year = this.date.getFullYear();
    if (year < 1900 || year > 2100) {
        return next(new Error('保存失败：日期超出范围 (1900-2100)'));
    }
    
    next();
});

module.exports = mongoose.model('Album', albumSchema);