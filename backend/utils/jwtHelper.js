const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (userId, roles) => {
    return jwt.sign(
        { 
            id: userId,
            roles: roles // Array of role names
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
    );
};

// Verify JWT Token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = { generateToken, verifyToken };
