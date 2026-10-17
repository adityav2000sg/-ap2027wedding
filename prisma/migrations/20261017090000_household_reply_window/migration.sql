-- An extension to the reply deadline, for one household at a time.
--
-- The date on the invitation is one date for everybody, and rightly so: the
-- hotel and the caterer need a number. But a few people are always invited
-- late, and the alternative to this column is moving the deadline for all 249
-- or taking their answer down the phone and typing it in for them.
--
-- Null is the ordinary case and leaves the global deadline in charge.
ALTER TABLE "households" ADD COLUMN     "repliesOpenUntil" TIMESTAMP(3);
