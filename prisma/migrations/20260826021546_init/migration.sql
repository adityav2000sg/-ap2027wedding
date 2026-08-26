-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'PLANNER', 'FAMILY', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('HALDI', 'MEHENDI', 'SANGEET', 'SHAADI', 'RECEPTION', 'WELCOME', 'PUJA', 'COCKTAIL', 'AFTERPARTY', 'BRUNCH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GuestSide" AS ENUM ('BRIDE', 'GROOM', 'BOTH');

-- CreateEnum
CREATE TYPE "DietaryPreference" AS ENUM ('NON_VEGETARIAN', 'VEGETARIAN', 'JAIN', 'VEGAN', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('NOT_CONTACTED', 'SAVE_THE_DATE_SENT', 'INVITED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('NOT_INVITED', 'PENDING', 'CONFIRMED', 'DECLINED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('VENUE', 'CATERING', 'DECOR', 'PHOTOGRAPHY', 'VIDEOGRAPHY', 'MAKEUP', 'MEHENDI', 'DJ', 'ENTERTAINMENT', 'CHOREOGRAPHY', 'PLANNER', 'PRIEST', 'INVITATIONS', 'TRANSPORTATION', 'HOTELS', 'JEWELLERY', 'OUTFITS', 'GIFTS', 'RENTALS', 'SECURITY', 'HOSPITALITY', 'AV', 'LIGHTING', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('RESEARCHING', 'CONTACTED', 'QUOTE_RECEIVED', 'SHORTLISTED', 'NEGOTIATING', 'SELECTED', 'CONTRACTED', 'ACTIVE', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InteractionKind" AS ENUM ('NOTE', 'CALL', 'MEETING', 'EMAIL', 'SITE_VISIT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CostModel" AS ENUM ('FIXED', 'PER_GUEST', 'PER_HOUSEHOLD', 'PER_ROOM', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "GuestBasis" AS ENUM ('ESTIMATED', 'INVITED', 'CONFIRMED', 'CONFIRMED_PLUS_PENDING');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UPCOMING', 'DUE', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "PlanPhase" AS ENUM ('TWELVE_PLUS_MONTHS', 'NINE_TO_TWELVE_MONTHS', 'SIX_TO_NINE_MONTHS', 'FOUR_TO_SIX_MONTHS', 'THREE_MONTHS', 'TWO_MONTHS', 'ONE_MONTH', 'TWO_WEEKS', 'WEDDING_WEEK', 'WEDDING_DAY', 'POST_WEDDING');

-- CreateEnum
CREATE TYPE "TimelineStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'DELAYED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TravelDirection" AS ENUM ('ARRIVAL', 'DEPARTURE');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('FLIGHT', 'TRAIN', 'CAR', 'BUS');

-- CreateEnum
CREATE TYPE "OutfitStatus" AS ENUM ('IDEA', 'SHORTLISTING', 'ORDERED', 'RECEIVED', 'ALTERATIONS', 'READY', 'WORN', 'RETURNED');

-- CreateEnum
CREATE TYPE "FittingKind" AS ENUM ('FIRST', 'SECOND', 'FINAL', 'TRIAL');

-- CreateEnum
CREATE TYPE "JewelleryOwnership" AS ENUM ('OWNED', 'PURCHASED', 'RENTED', 'BORROWED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CONTRACT', 'INVOICE', 'QUOTE', 'MENU', 'MOODBOARD', 'PLAN', 'ITINERARY', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "ResponsibilityStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('MANUAL', 'AUTOMATED', 'AI');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarTone" TEXT NOT NULL DEFAULT 'saffron',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_members" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'FAMILY',
    "relation" TEXT NOT NULL,
    "overrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wedding_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weddings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "partnerAName" TEXT NOT NULL,
    "partnerBName" TEXT NOT NULL,
    "weddingType" TEXT NOT NULL DEFAULT 'North Indian',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "estimatedGuests" INTEGER NOT NULL DEFAULT 320,
    "totalBudget" DECIMAL(14,2) NOT NULL,
    "contingencyPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasPlanner" BOOLEAN NOT NULL DEFAULT true,
    "rsvpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "traditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guestsPerRoom" INTEGER NOT NULL DEFAULT 2,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "capacity" INTEGER,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "curfewMinute" INTEGER,
    "alcoholAllowed" BOOLEAN NOT NULL DEFAULT true,
    "outsideCatering" BOOLEAN NOT NULL DEFAULT true,
    "hasRainBackup" BOOLEAN NOT NULL DEFAULT false,
    "hasPowerBackup" BOOLEAN NOT NULL DEFAULT false,
    "hasBridalRoom" BOOLEAN NOT NULL DEFAULT false,
    "parkingSpaces" INTEGER,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "EventKind" NOT NULL DEFAULT 'CUSTOM',
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "venueId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "dressCode" TEXT,
    "estimatedGuests" INTEGER NOT NULL DEFAULT 0,
    "accentTone" TEXT NOT NULL DEFAULT 'saffron',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "side" "GuestSide" NOT NULL DEFAULT 'BOTH',
    "relationship" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "address" TEXT,
    "rsvpToken" TEXT NOT NULL,
    "invitationStatus" "InvitationStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "invitationDeliveredAt" TIMESTAMP(3),
    "giftReceived" BOOLEAN NOT NULL DEFAULT false,
    "giftNote" TEXT,
    "notes" TEXT,
    "rsvpMessage" TEXT,
    "rsvpSubmittedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "householdId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "side" "GuestSide" NOT NULL DEFAULT 'BOTH',
    "relationship" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isVIP" BOOLEAN NOT NULL DEFAULT false,
    "isChild" BOOLEAN NOT NULL DEFAULT false,
    "isSenior" BOOLEAN NOT NULL DEFAULT false,
    "dietary" "DietaryPreference" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "allergies" TEXT,
    "accessibilityNeeds" TEXT,
    "needsAccommodation" BOOLEAN NOT NULL DEFAULT false,
    "needsTransport" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_invitations" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'RESEARCHING',
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "city" TEXT,
    "rating" INTEGER,
    "pros" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decisionReason" TEXT,
    "packageInfo" TEXT,
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "quoteAmount" DECIMAL(14,2),
    "negotiatedAmount" DECIMAL(14,2),
    "contractedAmount" DECIMAL(14,2),
    "depositAmount" DECIMAL(14,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_events" (
    "vendorId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "vendor_events_pkey" PRIMARY KEY ("vendorId","eventId")
);

-- CreateTable
CREATE TABLE "vendor_quotes" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "vendor_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_attributes" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "vendor_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_interactions" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "InteractionKind" NOT NULL DEFAULT 'NOTE',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "vendor_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_comparisons" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "vendorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "signedDate" DATE,
    "expiryDate" DATE,
    "terms" TEXT,
    "cancellationPolicy" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allocatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accentTone" TEXT NOT NULL DEFAULT 'saffron',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventId" TEXT,
    "vendorId" TEXT,
    "costModel" "CostModel" NOT NULL DEFAULT 'FIXED',
    "guestBasis" "GuestBasis" NOT NULL DEFAULT 'CONFIRMED_PLUS_PENDING',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "allocatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fixedAmount" DECIMAL(14,2),
    "unitRate" DECIMAL(14,2),
    "unitQuantity" DECIMAL(12,2),
    "estimateAmount" DECIMAL(14,2),
    "quoteAmount" DECIMAL(14,2),
    "negotiatedAmount" DECIMAL(14,2),
    "contractedAmount" DECIMAL(14,2),
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payers" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'person',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "budgetItemId" TEXT,
    "vendorId" TEXT,
    "payerId" TEXT,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "conversionRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "dueDate" DATE NOT NULL,
    "paidDate" DATE,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UPCOMING',
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "documentId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_snapshots" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "budgetItemId" TEXT,
    "forecastTotal" DECIMAL(14,2) NOT NULL,
    "allocatedTotal" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "importance" INTEGER NOT NULL DEFAULT 3,
    "phase" "PlanPhase" NOT NULL DEFAULT 'SIX_TO_NINE_MONTHS',
    "ownerId" TEXT,
    "eventId" TEXT,
    "categoryId" TEXT,
    "budgetItemId" TEXT,
    "vendorId" TEXT,
    "parentId" TEXT,
    "startDate" DATE,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "estimatedCost" DECIMAL(14,2),
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "templateKey" TEXT,
    "offsetDays" INTEGER,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_collaborators" (
    "taskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "task_collaborators_pkey" PRIMARY KEY ("taskId","memberId")
);

-- CreateTable
CREATE TABLE "task_guest_links" (
    "taskId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,

    CONSTRAINT "task_guest_links_pkey" PRIMARY KEY ("taskId","guestId")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "area" TEXT NOT NULL,
    "phase" "PlanPhase" NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "eventKinds" "EventKind"[] DEFAULT ARRAY[]::"EventKind"[],
    "requiresTradition" TEXT,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "location" TEXT,
    "ownerId" TEXT,
    "vendorId" TEXT,
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "status" "TimelineStatus" NOT NULL DEFAULT 'PLANNED',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_dependencies" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "gapMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "timeline_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "contractedRooms" INTEGER NOT NULL DEFAULT 0,
    "ratePerNight" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "checkInMinute" INTEGER NOT NULL DEFAULT 840,
    "checkOutMinute" INTEGER NOT NULL DEFAULT 660,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "ratePerNight" DECIMAL(14,2),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stays" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT,
    "roomNumber" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_records" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "direction" "TravelDirection" NOT NULL,
    "mode" "TravelMode" NOT NULL DEFAULT 'FLIGHT',
    "carrier" TEXT,
    "serviceNumber" TEXT,
    "hub" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "pickupRequired" BOOLEAN NOT NULL DEFAULT false,
    "journeyId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_vehicles" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL DEFAULT 'Sedan',
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "vendorId" TEXT,
    "costPerDay" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_journeys" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "eventId" TEXT,
    "purpose" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_passengers" (
    "journeyId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,

    CONSTRAINT "journey_passengers_pkey" PRIMARY KEY ("journeyId","guestId")
);

-- CreateTable
CREATE TABLE "wardrobe_people" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wardrobe_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outfits" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT,
    "outfitType" TEXT NOT NULL,
    "designer" TEXT,
    "vendorId" TEXT,
    "imageUrl" TEXT,
    "inspirationUrl" TEXT,
    "orderDate" DATE,
    "deliveryDate" DATE,
    "cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "OutfitStatus" NOT NULL DEFAULT 'IDEA',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outfits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fittings" (
    "id" TEXT NOT NULL,
    "outfitId" TEXT NOT NULL,
    "kind" "FittingKind" NOT NULL DEFAULT 'FIRST',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "taskId" TEXT,

    CONSTRAINT "fittings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outfit_accessories" (
    "id" TEXT NOT NULL,
    "outfitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" DECIMAL(14,2),
    "status" "OutfitStatus" NOT NULL DEFAULT 'IDEA',
    "notes" TEXT,

    CONSTRAINT "outfit_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jewellery_items" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "personId" TEXT,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "ownership" "JewelleryOwnership" NOT NULL DEFAULT 'OWNED',
    "jeweller" TEXT,
    "cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pickupDate" DATE,
    "returnDate" DATE,
    "responsibleId" TEXT,
    "storageNote" TEXT,
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jewellery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT,
    "visibleToRoles" "MemberRole"[] DEFAULT ARRAY[]::"MemberRole"[],
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsibilities" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "ownerId" TEXT,
    "backupId" TEXT,
    "eventId" TEXT,
    "dueDate" DATE,
    "status" "ResponsibilityStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "importance" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "actorId" TEXT,
    "source" "ActivitySource" NOT NULL DEFAULT 'MANUAL',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "undoable" BOOLEAN NOT NULL DEFAULT false,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "achievedAt" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_dismissals" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "dismissedById" TEXT,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_action_proposals" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "conversationId" TEXT,
    "action" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "impact" JSONB,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ai_action_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "wedding_members_weddingId_idx" ON "wedding_members"("weddingId");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_members_weddingId_userId_key" ON "wedding_members"("weddingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "weddings_slug_key" ON "weddings"("slug");

-- CreateIndex
CREATE INDEX "venues_weddingId_idx" ON "venues"("weddingId");

-- CreateIndex
CREATE INDEX "events_weddingId_date_idx" ON "events"("weddingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "events_weddingId_slug_key" ON "events"("weddingId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "households_rsvpToken_key" ON "households"("rsvpToken");

-- CreateIndex
CREATE INDEX "households_weddingId_idx" ON "households"("weddingId");

-- CreateIndex
CREATE INDEX "guests_weddingId_archivedAt_idx" ON "guests"("weddingId", "archivedAt");

-- CreateIndex
CREATE INDEX "guests_householdId_idx" ON "guests"("householdId");

-- CreateIndex
CREATE INDEX "event_invitations_eventId_status_idx" ON "event_invitations"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_guestId_eventId_key" ON "event_invitations"("guestId", "eventId");

-- CreateIndex
CREATE INDEX "vendors_weddingId_category_idx" ON "vendors"("weddingId", "category");

-- CreateIndex
CREATE INDEX "vendor_quotes_vendorId_idx" ON "vendor_quotes"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_attributes_vendorId_key_key" ON "vendor_attributes"("vendorId", "key");

-- CreateIndex
CREATE INDEX "vendor_interactions_vendorId_idx" ON "vendor_interactions"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_comparisons_weddingId_idx" ON "vendor_comparisons"("weddingId");

-- CreateIndex
CREATE INDEX "contracts_weddingId_idx" ON "contracts"("weddingId");

-- CreateIndex
CREATE INDEX "budget_categories_weddingId_idx" ON "budget_categories"("weddingId");

-- CreateIndex
CREATE INDEX "budget_items_weddingId_categoryId_idx" ON "budget_items"("weddingId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "payers_weddingId_name_key" ON "payers"("weddingId", "name");

-- CreateIndex
CREATE INDEX "payments_weddingId_status_idx" ON "payments"("weddingId", "status");

-- CreateIndex
CREATE INDEX "payments_weddingId_dueDate_idx" ON "payments"("weddingId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "currency_rates_weddingId_fromCurrency_toCurrency_effectiveD_key" ON "currency_rates"("weddingId", "fromCurrency", "toCurrency", "effectiveDate");

-- CreateIndex
CREATE INDEX "forecast_snapshots_weddingId_capturedAt_idx" ON "forecast_snapshots"("weddingId", "capturedAt");

-- CreateIndex
CREATE INDEX "tasks_weddingId_status_idx" ON "tasks"("weddingId", "status");

-- CreateIndex
CREATE INDEX "tasks_weddingId_dueDate_idx" ON "tasks"("weddingId", "dueDate");

-- CreateIndex
CREATE INDEX "tasks_eventId_idx" ON "tasks"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_taskId_dependsOnId_key" ON "task_dependencies"("taskId", "dependsOnId");

-- CreateIndex
CREATE INDEX "task_comments_taskId_idx" ON "task_comments"("taskId");

-- CreateIndex
CREATE INDEX "task_templates_weddingId_area_idx" ON "task_templates"("weddingId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_weddingId_key_key" ON "task_templates"("weddingId", "key");

-- CreateIndex
CREATE INDEX "timeline_entries_weddingId_date_idx" ON "timeline_entries"("weddingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_dependencies_entryId_dependsOnId_key" ON "timeline_dependencies"("entryId", "dependsOnId");

-- CreateIndex
CREATE INDEX "hotels_weddingId_idx" ON "hotels"("weddingId");

-- CreateIndex
CREATE INDEX "stays_weddingId_idx" ON "stays"("weddingId");

-- CreateIndex
CREATE INDEX "travel_records_weddingId_scheduledAt_idx" ON "travel_records"("weddingId", "scheduledAt");

-- CreateIndex
CREATE INDEX "transport_vehicles_weddingId_idx" ON "transport_vehicles"("weddingId");

-- CreateIndex
CREATE INDEX "transport_journeys_weddingId_date_idx" ON "transport_journeys"("weddingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "wardrobe_people_weddingId_name_key" ON "wardrobe_people"("weddingId", "name");

-- CreateIndex
CREATE INDEX "outfits_weddingId_personId_idx" ON "outfits"("weddingId", "personId");

-- CreateIndex
CREATE INDEX "fittings_outfitId_idx" ON "fittings"("outfitId");

-- CreateIndex
CREATE INDEX "jewellery_items_weddingId_idx" ON "jewellery_items"("weddingId");

-- CreateIndex
CREATE INDEX "documents_weddingId_kind_idx" ON "documents"("weddingId", "kind");

-- CreateIndex
CREATE INDEX "document_links_entityType_entityId_idx" ON "document_links"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "document_links_documentId_entityType_entityId_key" ON "document_links"("documentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "responsibilities_weddingId_idx" ON "responsibilities"("weddingId");

-- CreateIndex
CREATE INDEX "activity_logs_weddingId_createdAt_idx" ON "activity_logs"("weddingId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_weddingId_key_key" ON "milestones"("weddingId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "alert_dismissals_weddingId_alertKey_key" ON "alert_dismissals"("weddingId", "alertKey");

-- CreateIndex
CREATE INDEX "ai_conversations_weddingId_idx" ON "ai_conversations"("weddingId");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_idx" ON "ai_messages"("conversationId");

-- CreateIndex
CREATE INDEX "ai_action_proposals_weddingId_status_idx" ON "ai_action_proposals"("weddingId", "status");

-- AddForeignKey
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_events" ADD CONSTRAINT "vendor_events_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_events" ADD CONSTRAINT "vendor_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_quotes" ADD CONSTRAINT "vendor_quotes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_attributes" ADD CONSTRAINT "vendor_attributes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_interactions" ADD CONSTRAINT "vendor_interactions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_interactions" ADD CONSTRAINT "vendor_interactions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_comparisons" ADD CONSTRAINT "vendor_comparisons_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payers" ADD CONSTRAINT "payers_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "budget_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "wedding_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_guest_links" ADD CONSTRAINT "task_guest_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_guest_links" ADD CONSTRAINT "task_guest_links_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_dependencies" ADD CONSTRAINT "timeline_dependencies_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "timeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_dependencies" ADD CONSTRAINT "timeline_dependencies_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "timeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_records" ADD CONSTRAINT "travel_records_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_records" ADD CONSTRAINT "travel_records_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_records" ADD CONSTRAINT "travel_records_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "transport_journeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_journeys" ADD CONSTRAINT "transport_journeys_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_journeys" ADD CONSTRAINT "transport_journeys_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "transport_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_journeys" ADD CONSTRAINT "transport_journeys_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_passengers" ADD CONSTRAINT "journey_passengers_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "transport_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_passengers" ADD CONSTRAINT "journey_passengers_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wardrobe_people" ADD CONSTRAINT "wardrobe_people_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_personId_fkey" FOREIGN KEY ("personId") REFERENCES "wardrobe_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_accessories" ADD CONSTRAINT "outfit_accessories_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jewellery_items" ADD CONSTRAINT "jewellery_items_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jewellery_items" ADD CONSTRAINT "jewellery_items_personId_fkey" FOREIGN KEY ("personId") REFERENCES "wardrobe_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jewellery_items" ADD CONSTRAINT "jewellery_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jewellery_items" ADD CONSTRAINT "jewellery_items_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibilities" ADD CONSTRAINT "responsibilities_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibilities" ADD CONSTRAINT "responsibilities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibilities" ADD CONSTRAINT "responsibilities_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "wedding_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibilities" ADD CONSTRAINT "responsibilities_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_dismissals" ADD CONSTRAINT "alert_dismissals_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_dismissals" ADD CONSTRAINT "alert_dismissals_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_proposals" ADD CONSTRAINT "ai_action_proposals_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_proposals" ADD CONSTRAINT "ai_action_proposals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
