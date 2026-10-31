const corsOptions = {
  // If CLIENT_URL is unset, undefined ends up in this array and the cors
  // package then rejects every origin. filter(Boolean) guards against that.
  origin: [
    `http://localhost:5173`,
    `http://localhost:4173`,
    process.env.CLIENT_URL,
  ].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

const CANOPY_TOKEN = "canopy-token";

export { corsOptions, CANOPY_TOKEN };
