const generateUniqueId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const generateStopCode = () => {
  return String(Math.floor(1000 + Math.random() * 9000));
};

const generateOtp = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

module.exports = {
  generateUniqueId,
  generateStopCode,
  generateOtp,
};
