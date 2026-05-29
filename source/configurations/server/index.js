const Env = require("../environment");

const serverConfig = (server, app) => {
  app.use((req, res) => {
    res.status(404).send("Route not found");
  });

  const port = Env.PORT;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Group Alarm Service listening on port ${port} (0.0.0.0)`);
    console.log(`Admin API: ${Env.BASE_PATH_ADMIN}`);
    console.log(`User API: ${Env.BASE_PATH_USER}`);
  });
};

module.exports = serverConfig;
