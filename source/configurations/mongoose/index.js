const mongoose = require("mongoose");

mongoose.plugin((schema) => {
  schema.set("versionKey", false);
  const strip = (_, ret) => {
    delete ret.__v;
    return ret;
  };
  schema.set("toJSON", { transform: strip, virtuals: true });
  schema.set("toObject", { transform: strip, virtuals: true });
});

module.exports = mongoose;
