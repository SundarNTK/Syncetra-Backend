const { v2: cloudinary } = require("cloudinary");
const Env = require("../environment");

cloudinary.config({
  cloud_name: Env.CLOUDINARY_CLOUD_NAME,
  api_key:    Env.CLOUDINARY_API_KEY,
  api_secret: Env.CLOUDINARY_API_SECRET,
  secure:     true,
});

module.exports = cloudinary;
