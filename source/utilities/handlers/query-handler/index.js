const queryHandler = (req) => {
  const { search, page = 1, limit = 50, sortBy = "createdAt", sortOrder = "desc" } =
    req.query;

  const searchQuery = { isDeleted: false };

  if (search) {
    searchQuery.$or = [
      { name: { $regex: search, $options: "i" } },
      { groupName: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
      { mobileNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const sortQuery = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const pageLimit = parseInt(limit, 10);

  return { searchQuery, sortQuery, skip, pageLimit, page: parseInt(page, 10) };
};

module.exports = queryHandler;
