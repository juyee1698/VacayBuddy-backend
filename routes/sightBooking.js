const express = require("express");

const router = express.Router();

const sightBookingController = require("../controllers/sightBooking");

router.post("/", sightBookingController.createSightBooking);
router.get("/", sightBookingController.getSightBooking);
router.get("/:id", sightBookingController.getSightBookingById);
router.put("/:id", sightBookingController.updateSightBooking);
router.delete("/:id", sightBookingController.deleteSightBooking);

module.exports = router;
