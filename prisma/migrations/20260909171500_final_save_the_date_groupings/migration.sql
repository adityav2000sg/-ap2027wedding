-- The attached Groupings workbook is the final save-the-date audience and
-- grouping authority: one row is one planning/room group and one shared link,
-- except guests with a personal rsvpToken who always answer individually.
--
-- This is intentionally a one-time data migration. The importer remains
-- available for reviewed future changes, but production startup must not
-- overwrite manual work on every restart.

CREATE TEMP TABLE "_save_the_date_groups" (
  "groupNo" INTEGER PRIMARY KEY,
  "sourceNames" TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO "_save_the_date_groups" ("groupNo", "sourceNames") VALUES
  (1, ARRAY['Dheeraj Chowdhry', 'Namrita Chowdhry']::TEXT[]),
  (2, ARRAY['Anousha Chowdhry', 'Aditya Vaidya']::TEXT[]),
  (3, ARRAY['Sadhna Chowdhry']::TEXT[]),
  (4, ARRAY['Mary Jane Bercero Bantoc']::TEXT[]),
  (5, ARRAY['Sangeeta Lamba', 'Anil Lamba']::TEXT[]),
  (6, ARRAY['Dhruv Lamba', 'Ananya Lamba', 'Vivaan Lamba', 'Kaiyo Lamba']::TEXT[]),
  (7, ARRAY['Aakash Lamba', 'Swati Shukla']::TEXT[]),
  (8, ARRAY['Ritu Prasad', 'Pranav Prasad', 'Pranay Prasad', 'Prashant Prasad']::TEXT[]),
  (9, ARRAY['Jalaj Sawhney', 'Puneya Sawhney', 'Avya Sawhney', 'Prisha Sawhney']::TEXT[]),
  (10, ARRAY['Sanjay Chowdhry', 'Neeta Chowdhry']::TEXT[]),
  (11, ARRAY['Aaditya Chowdhry', 'Sonia Chowdhry']::TEXT[]),
  (12, ARRAY['Ankita Chowdhry', 'Aman Bhasin']::TEXT[]),
  (13, ARRAY['Anil Ahuja', 'Latika Ahuja', 'Arshia Ahuja', 'Harsh Ahuja']::TEXT[]),
  (14, ARRAY['Neelam Chaudhry']::TEXT[]),
  (15, ARRAY['Sonal Chaudhry', 'Sachin Chaudhry', 'Rai Chaudhry', 'Bodi Chaudhry', 'Raina Chaudhry']::TEXT[]),
  (16, ARRAY['Charu Chaudhry', 'Mira Patel']::TEXT[]),
  (17, ARRAY['Nandini Minocha', 'Raaghav Minocha']::TEXT[]),
  (18, ARRAY['Sudarshan Narang', 'Ravi Narang']::TEXT[]),
  (19, ARRAY['Mona Bhatia', 'Vikas Bhatia']::TEXT[]),
  (20, ARRAY['Anushka Bhatia']::TEXT[]),
  (21, ARRAY['Mayank Bhatia']::TEXT[]),
  (22, ARRAY['Shinu Bansal', 'Vishal Bansal']::TEXT[]),
  (23, ARRAY['Malini Wadhera', 'Sumeet Wadhera']::TEXT[]),
  (24, ARRAY['Veenu Bharara', 'Vinit Bharara']::TEXT[]),
  (25, ARRAY['Pia Desai', 'Chaitanya Desai', 'Aanya Desai']::TEXT[]),
  (26, ARRAY['Sunita Singh', 'Vicky Singh']::TEXT[]),
  (27, ARRAY['Ajit Vaidya', 'Ketaki Vaidya', 'Atharva Vaidya']::TEXT[]),
  (28, ARRAY['Aditi Anand', 'Shyam Dhulapia', 'Baby Dhulapia']::TEXT[]),
  (29, ARRAY['Aradhana Rai Gupta', 'AP']::TEXT[]),
  (30, ARRAY['Abhinav Rai Gupta', 'Smiti Dani']::TEXT[]),
  (31, ARRAY['Saam Afshar Sadeghi']::TEXT[]),
  (32, ARRAY['Neena Anand', 'Sanjay Anand']::TEXT[]),
  (33, ARRAY['Anil Rai Gupta', 'Sangeeta Rai Gupta']::TEXT[]),
  (34, ARRAY['Rajeev Jain', 'Anu Jain']::TEXT[]),
  (35, ARRAY['Sharon Mascaranes']::TEXT[]),
  (36, ARRAY['Indu Rana']::TEXT[]),
  (37, ARRAY['Anuradha Nag', 'Ajay Nag', 'Karn Nag']::TEXT[]),
  (38, ARRAY['Mona Abrol', 'Manav Abrol']::TEXT[]),
  (39, ARRAY['Maitri Bobba', 'Shrinu Bobba']::TEXT[]),
  (40, ARRAY['Angela Subramaniam', 'Kami Subramaniam']::TEXT[]),
  (41, ARRAY['Anu Vaish', 'Pankaj Vaish']::TEXT[]),
  (42, ARRAY['Vipul Gupta', 'Jyoti Gupta']::TEXT[]),
  (43, ARRAY['Neeraj Gulati', 'Pooja Gulati']::TEXT[]),
  (44, ARRAY['Sonny Ahuja', 'Alpana Ahuja']::TEXT[]),
  (45, ARRAY['Ridhima Mukim', 'Gaurav Saran']::TEXT[]),
  (46, ARRAY['Preeti Mehan', 'Ajay Mehan']::TEXT[]),
  (47, ARRAY['Trisha Mehan']::TEXT[]),
  (48, ARRAY['Nani', 'Prashant Marwaha', 'Seema Marwaha', 'Parth Marwaha', 'Ryan Marwaha']::TEXT[]),
  (49, ARRAY['Aruna Oberoi', 'Rohit Oberoi', 'Udbhav Oberoi', 'Mishti Oberoi']::TEXT[]),
  (50, ARRAY['Sushrhth Mehan']::TEXT[]),
  (51, ARRAY['Sanjeev Mehan', 'Anita Mehan', 'Armaan Mehan']::TEXT[]),
  (52, ARRAY['Anoushka Mehan']::TEXT[]),
  (53, ARRAY['Maya Mehan']::TEXT[]),
  (54, ARRAY['Symron Mehan-Bedi', 'Rohan Bedi', 'Imaara Bedi']::TEXT[]),
  (55, ARRAY['Rajani Kundra', 'Rajiv Kundra']::TEXT[]),
  (56, ARRAY['Vijay Sai Kundra']::TEXT[]),
  (57, ARRAY['Achinta Kundra']::TEXT[]),
  (58, ARRAY['Angela Maini', 'Kuldeep Maini']::TEXT[]),
  (59, ARRAY['Rohin Maini', 'Janki Patel', 'Ananya Maini']::TEXT[]),
  (60, ARRAY['Karishma Maini', 'Shyam Pattni']::TEXT[]),
  (61, ARRAY['Arun Anand', 'Leena Anand']::TEXT[]),
  (62, ARRAY['Nikhil Anand', 'Lowri Beynon']::TEXT[]),
  (63, ARRAY['Aneesh Anand', 'Chandni Anand']::TEXT[]),
  (64, ARRAY['Sanjay Anand', 'Indu Anand']::TEXT[]),
  (65, ARRAY['Shriya Anand', 'Kathryn']::TEXT[]),
  (66, ARRAY['Sachin Anand']::TEXT[]),
  (67, ARRAY['Ishaan Anand']::TEXT[]),
  (68, ARRAY['Hem Takiar', 'Deepka Takiar']::TEXT[]),
  (69, ARRAY['Sahil Takiar', 'Puja Takiar', 'Inaaya Takiar', 'Amara Takiar']::TEXT[]),
  (70, ARRAY['Priya Takiar', 'Dhruv Batura', 'Shaan Batura', 'Maya Batura']::TEXT[]),
  (71, ARRAY['Jugesh Mehta']::TEXT[]),
  (72, ARRAY['Kajal Mehta']::TEXT[]),
  (73, ARRAY['Eisha Mehta-Patton', 'Ryan Patton', 'Lyla Mehta-Patton', 'Lily Mehta-Patton']::TEXT[]),
  (74, ARRAY['Aarti Gujral', 'Kapil Gujral']::TEXT[]),
  (75, ARRAY['Rohan Mohindra']::TEXT[]),
  (76, ARRAY['Sunil Mohindra', 'Meera Mohindra']::TEXT[]),
  (77, ARRAY['Ravi Mohindra', 'Alex Richardson']::TEXT[]),
  (78, ARRAY['Tom Westbrook']::TEXT[]),
  (79, ARRAY['Oliver Westbrook']::TEXT[]),
  (80, ARRAY['Rohit Kumar']::TEXT[]),
  (81, ARRAY['Anuj Mehra']::TEXT[]),
  (82, ARRAY['Ayush Joshi']::TEXT[]),
  (83, ARRAY['Kieron Wilson']::TEXT[]),
  (84, ARRAY['Reuben Singh', 'Baani Singh']::TEXT[]),
  (85, ARRAY['Sonu Chadha', 'Leeza Chadha']::TEXT[]),
  (86, ARRAY['Ken Banga', 'Ashu Banga']::TEXT[]),
  (87, ARRAY['Amit Anand', 'Bobby Anand']::TEXT[]),
  (88, ARRAY['Dip Chopra', 'Sonu Chopra']::TEXT[]),
  (89, ARRAY['Anuj Vij', 'Deepta Vij']::TEXT[]),
  (90, ARRAY['Mahesh Jain', 'Angela Jain']::TEXT[]),
  (91, ARRAY['Rinku Jairath', 'Ritika Jairath']::TEXT[]),
  (92, ARRAY['Amit Arora', 'Mumta Arora']::TEXT[]),
  (93, ARRAY['Gautam Munjal', 'Swati Munjal']::TEXT[]),
  (94, ARRAY['Rajesh Kharabanda', 'Divya Kharabanda']::TEXT[]),
  (95, ARRAY['Kamaljit Singh', 'Josh Singh']::TEXT[]),
  (96, ARRAY['Ashish Dhawan', 'Jenny Dhawan']::TEXT[]),
  (97, ARRAY['Sanjay Jairath', 'Mona Jairath']::TEXT[]),
  (98, ARRAY['Vicky Jerath', 'Geetu Jerath']::TEXT[]),
  (99, ARRAY['Rajiv Sood', 'Rita Sood']::TEXT[]),
  (100, ARRAY['Rajiv Randev', 'Shalini Randev']::TEXT[]),
  (101, ARRAY['Parikshit Bardhaja', 'Sheetal Bardhaja']::TEXT[]),
  (102, ARRAY['Shiv Bajaj', 'Anu Bajaj']::TEXT[]),
  (103, ARRAY['Sunil Abrol', 'Neelam Abrol']::TEXT[]),
  (104, ARRAY['Suresh Ruia', 'Anita Ruia']::TEXT[]),
  (105, ARRAY['Muttaqee Dar']::TEXT[]),
  (106, ARRAY['Bintay Zahra']::TEXT[]),
  (107, ARRAY['Josh Keeling']::TEXT[]),
  (108, ARRAY['Jelena Vukovic']::TEXT[]),
  (109, ARRAY['Sebastien Santhiapillai']::TEXT[]),
  (110, ARRAY['Sophie Norman']::TEXT[]),
  (111, ARRAY['Alistair McGuire']::TEXT[]),
  (112, ARRAY['Priyanka Nankani']::TEXT[]),
  (113, ARRAY['Lara Bird']::TEXT[]),
  (114, ARRAY['Angus Forbes']::TEXT[]),
  (115, ARRAY['Katie O''Byrne']::TEXT[]),
  (116, ARRAY['Tim Stuart']::TEXT[]),
  (117, ARRAY['John Nicolaou', 'Marilena Nicolaou']::TEXT[]),
  (118, ARRAY['Azmat Habibullah']::TEXT[]),
  (119, ARRAY['Josh Ray']::TEXT[]),
  (120, ARRAY['Ellie Cherrill']::TEXT[]),
  (121, ARRAY['Abi Bateman']::TEXT[]),
  (122, ARRAY['Stef Roxanis']::TEXT[]),
  (123, ARRAY['Amay Bham', 'Ashray Bham']::TEXT[]);

CREATE TEMP TABLE "_save_the_date_members" (
  "groupNo" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "guestId" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  PRIMARY KEY ("groupNo", "position")
) ON COMMIT DROP;

DO $migration$
DECLARE
  wedding_id TEXT;
  item RECORD;
  source_key TEXT;
  target_name TEXT;
  target_side TEXT;
  guest_id TEXT;
  match_count INTEGER;
  group_row RECORD;
  member_ids TEXT[];
  household_id TEXT;
  group_name TEXT;
  personal_link_count INTEGER;
BEGIN
  SELECT "id" INTO wedding_id
  FROM "weddings"
  WHERE "slug" = 'avantika-prateek'
  LIMIT 1;

  IF wedding_id IS NULL THEN
    -- On a brand-new database migrations run before the seed. The seed invokes
    -- the same checked-in grouping importer after it creates the wedding.
    RETURN;
  END IF;

  -- The workbook uses Vinit; the old master list used Vinnie.
  UPDATE "guests"
  SET "firstName" = 'Vinit', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "weddingId" = wedding_id
    AND "firstName" = 'Vinnie'
    AND "lastName" = 'Bharara'
    AND "archivedAt" IS NULL;

  -- Four children are on the final workbook but were absent from the old list.
  INSERT INTO "guests" (
    "id", "weddingId", "firstName", "lastName", "side", "relationship",
    "country", "tags", "isVIP", "isChild", "isSenior", "dietary",
    "needsAccommodation", "needsTransport", "tier", "attendanceScore",
    "createdAt", "updatedAt"
  )
  SELECT
    REPLACE(gen_random_uuid()::text, '-', ''),
    wedding_id,
    child."firstName",
    child."lastName",
    'GROOM',
    'Extended Family',
    'India',
    ARRAY[]::TEXT[],
    false,
    true,
    false,
    'NOT_SPECIFIED',
    true,
    true,
    'A',
    3,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM (
    VALUES
      ('Inaaya', 'Takiar'),
      ('Amara', 'Takiar'),
      ('Shaan', 'Batura'),
      ('Maya', 'Batura')
  ) AS child("firstName", "lastName")
  WHERE NOT EXISTS (
    SELECT 1
    FROM "guests" AS existing
    WHERE existing."weddingId" = wedding_id
      AND existing."firstName" = child."firstName"
      AND existing."lastName" = child."lastName"
      AND existing."archivedAt" IS NULL
  );

  -- Every invited guest attends every event, so the new children belong to all
  -- five event guest lists as well.
  INSERT INTO "event_invitations" (
    "id", "guestId", "eventId", "status", "createdAt", "updatedAt"
  )
  SELECT
    REPLACE(gen_random_uuid()::text, '-', ''),
    guest."id",
    event."id",
    'PENDING',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "guests" AS guest
  JOIN "events" AS event ON event."weddingId" = guest."weddingId"
  WHERE guest."weddingId" = wedding_id
    AND (guest."firstName", guest."lastName") IN (
      ('Inaaya', 'Takiar'),
      ('Amara', 'Takiar'),
      ('Shaan', 'Batura'),
      ('Maya', 'Batura')
    )
  ON CONFLICT ("guestId", "eventId") DO NOTHING;

  FOR item IN
    SELECT
      source."groupNo",
      source_name AS "sourceName",
      position
    FROM "_save_the_date_groups" AS source
    CROSS JOIN LATERAL unnest(source."sourceNames")
      WITH ORDINALITY AS names(source_name, position)
    ORDER BY source."groupNo", position
  LOOP
    source_key := LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(TRIM(item."sourceName"), '[.''’]', '', 'g'),
        '[[:space:]]+', ' ', 'g'
      )
    );

    target_name := CASE source_key
      WHEN 'mary jane bercero bantoc' THEN 'Mary Jane Bantoc'
      WHEN 'swati shukla' THEN 'Swati Lamba'
      WHEN 'shinu bansal' THEN 'Shinu Ahuja'
      WHEN 'vinit bharara' THEN 'Vinit Bharara'
      WHEN 'ap' THEN 'Anil Parashar'
      WHEN 'smiti dani' THEN 'Smiti Gupta'
      WHEN 'nani' THEN 'Nani Marwaha'
      WHEN 'janki patel' THEN 'Janki Maini'
      WHEN 'shyam pattni' THEN 'Shyam Patni'
      WHEN 'kathryn' THEN 'Katheryn'
      WHEN 'vicky jerath' THEN 'Vicky Jareth'
      WHEN 'geetu jerath' THEN 'Geetu Jareth'
      ELSE item."sourceName"
    END;

    target_side := CASE
      WHEN item."groupNo" = 32 AND source_key = 'sanjay anand' THEN 'BRIDE'
      WHEN item."groupNo" = 64 AND source_key = 'sanjay anand' THEN 'GROOM'
      WHEN item."groupNo" = 123 AND source_key IN ('amay bham', 'ashray bham') THEN 'GROOM'
      ELSE NULL
    END;

    SELECT COUNT(*), MIN(guest."id")
    INTO match_count, guest_id
    FROM "guests" AS guest
    WHERE guest."weddingId" = wedding_id
      AND guest."archivedAt" IS NULL
      AND LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            TRIM(CONCAT_WS(' ', guest."firstName", guest."lastName")),
            '[.''’]', '', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) = LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(TRIM(target_name), '[.''’]', '', 'g'),
          '[[:space:]]+', ' ', 'g'
        )
      )
      AND (target_side IS NULL OR guest."side"::text = target_side);

    IF match_count <> 1 THEN
      RAISE EXCEPTION 'Expected one match for row %, %, found %',
        item."groupNo", item."sourceName", match_count;
    END IF;

    INSERT INTO "_save_the_date_members" (
      "groupNo", "position", "guestId", "displayName"
    ) VALUES (
      item."groupNo", item.position, guest_id, target_name
    );
  END LOOP;

  IF (SELECT COUNT(*) FROM "_save_the_date_members") <> 233 THEN
    RAISE EXCEPTION 'Expected 233 save-the-date guests';
  END IF;

  UPDATE "guests"
  SET "tier" = 'A', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "weddingId" = wedding_id
    AND "id" IN (SELECT "guestId" FROM "_save_the_date_members");

  UPDATE "guests"
  SET "tier" = 'B', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "weddingId" = wedding_id
    AND "archivedAt" IS NULL
    AND "tier" = 'A'
    AND "id" NOT IN (SELECT "guestId" FROM "_save_the_date_members");

  FOR group_row IN
    SELECT "groupNo"
    FROM "_save_the_date_groups"
    ORDER BY "groupNo"
  LOOP
    SELECT
      ARRAY_AGG(member."guestId" ORDER BY member."guestId"),
      STRING_AGG(member."displayName", ' & ' ORDER BY member."position")
    INTO member_ids, group_name
    FROM "_save_the_date_members" AS member
    WHERE member."groupNo" = group_row."groupNo";

    SELECT household."id"
    INTO household_id
    FROM "households" AS household
    WHERE household."weddingId" = wedding_id
      AND ARRAY(
        SELECT guest."id"
        FROM "guests" AS guest
        WHERE guest."householdId" = household."id"
          AND guest."archivedAt" IS NULL
        ORDER BY guest."id"
      ) = member_ids
    LIMIT 1;

    IF household_id IS NULL THEN
      household_id := REPLACE(gen_random_uuid()::text, '-', '');
      INSERT INTO "households" (
        "id", "weddingId", "name", "side", "country", "rsvpToken", "tier", "createdAt"
      ) VALUES (
        household_id,
        wedding_id,
        group_name,
        'BOTH',
        'India',
        REPLACE(gen_random_uuid()::text, '-', '') ||
          SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12),
        'A',
        CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE "households"
      SET "name" = group_name, "tier" = 'A'
      WHERE "id" = household_id;
    END IF;

    UPDATE "guests"
    SET "householdId" = household_id, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ANY(member_ids);
  END LOOP;

  UPDATE "households" AS household
  SET "tier" = 'B'
  WHERE household."weddingId" = wedding_id
    AND household."tier" = 'A'
    AND household."id" NOT IN (
      SELECT DISTINCT guest."householdId"
      FROM "guests" AS guest
      WHERE guest."weddingId" = wedding_id
        AND guest."archivedAt" IS NULL
        AND guest."tier" = 'A'
        AND guest."householdId" IS NOT NULL
    );

  DELETE FROM "households" AS household
  WHERE household."weddingId" = wedding_id
    AND NOT EXISTS (
      SELECT 1 FROM "guests" AS guest
      WHERE guest."householdId" = household."id"
    );

  IF (
    SELECT COUNT(*)
    FROM "guests"
    WHERE "weddingId" = wedding_id
      AND "archivedAt" IS NULL
      AND "tier" = 'A'
  ) <> 233 THEN
    RAISE EXCEPTION 'Tier A did not reconcile to 233 guests';
  END IF;

  IF (
    SELECT COUNT(DISTINCT "householdId")
    FROM "guests"
    WHERE "weddingId" = wedding_id
      AND "archivedAt" IS NULL
      AND "tier" = 'A'
  ) <> 123 THEN
    RAISE EXCEPTION 'Tier A did not reconcile to 123 groups';
  END IF;

  SELECT COUNT(*)
  INTO personal_link_count
  FROM "guests"
  WHERE "weddingId" = wedding_id
    AND "archivedAt" IS NULL
    AND "tier" = 'A'
    AND "rsvpToken" IS NOT NULL;

  IF personal_link_count <> 16 THEN
    RAISE EXCEPTION 'Expected 16 preserved personal invitation links, found %',
      personal_link_count;
  END IF;
END
$migration$;
