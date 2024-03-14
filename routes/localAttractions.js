const express = require("express");
const router = express.Router();
const localAttractionController = require("../controllers/localAttractions");

// GET /localAttractions
router.get("/", localAttractionController.getLocalAttractions);
router.get("/:id", localAttractionController.getLocalAttraction);
router.post("/", localAttractionController.createLocalAttraction);
router.delete("/:id", localAttractionController.deleteLocalAttraction);
router.put("/:id", localAttractionController.updateLocalAttraction);
//export default router;
module.exports = router;
