const jwt = require("jsonwebtoken");
const Env = require("../../../configurations/environment");

const signToken = (payload) => {
  return jwt.sign(payload, Env.JWT_SECRET, {
    expiresIn: Env.JWT_EXPIRES_IN,
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, Env.JWT_SECRET);
};

module.exports = { signToken, verifyToken };
