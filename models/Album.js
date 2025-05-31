const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        required: true,
        min: [1, '年龄必须大于0'],
        max: [150, '年龄超出范围']
    },
    gender: {
        type: String,
        enum: ['男', '女', '其他'], // ✅ 중국어 값 허용
        required: true
    },
    email: {
        type: String,
        required: true,
        match: [/^\S+@\S+\.\S+$/, '邮箱格式不正确']
    },
    date: {
        type: Date,
        required: [true, '日期是必填项'],
        validate: {
            validator: function(value) {
                return value && value.toString() !== 'Invalid Date';
            },
            message: '日期格式无效'
        },
        set: function(value) {
            if (value instanceof Date) return value;
            // 如果是字符串，尝试转换
            const date = new Date(value);
            if (date.toString() === 'Invalid Date') {
                console.error('Invalid date value:', value);
                throw new Error('Invalid date format');
            }
            return date;
        }
    },
    albumLength: {
        type: String, // ✅ "오후 04:01" 형식도 받을 수 있게 String으로
        required: true,
        validate: {
            validator: function(v) {
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
        required: true
    },
    audioUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: '处理中',
        enum: ['处理中', '已完成', '已取消']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 저장 전 날짜 유효성 검사
albumSchema.pre('save', function(next) {
    if (this.isModified('date')) {
        const date = this.date;
        if (!date || date.toString() === 'Invalid Date') {
            next(new Error('Invalid date'));
            return;
        }
    }
    next();
});

module.exports = mongoose.model('Album', albumSchema);