-- Tribe: the deep-cut layer under Interest, with progressive drill-down
-- into SubCommunity. RelationshipStyle: the values layer ("My ideal
-- relationship is…"). See prisma/schema.prisma comments for the full
-- rationale.

CREATE TABLE "Tribe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "personaLabel" TEXT NOT NULL DEFAULT '',
    "activityPhrase" TEXT NOT NULL DEFAULT '',
    "sharedPhrase" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Tribe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tribe_slug_key" ON "Tribe"("slug");

CREATE TABLE "SubCommunity" (
    "id" TEXT NOT NULL,
    "tribeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "SubCommunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubCommunity_tribeId_label_key" ON "SubCommunity"("tribeId", "label");

ALTER TABLE "SubCommunity" ADD CONSTRAINT "SubCommunity_tribeId_fkey"
    FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RelationshipStyle" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "pairPhrase" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RelationshipStyle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RelationshipStyle_label_key" ON "RelationshipStyle"("label");

-- Implicit many-to-many join tables, Prisma's standard naming/shape for
-- "@relation" fields on both sides with no extra columns (mirrors how
-- _ProfileInterests already works for Interest<->Profile).
CREATE TABLE "_ProfileTribes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProfileTribes_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_ProfileTribes_B_index" ON "_ProfileTribes"("B");
ALTER TABLE "_ProfileTribes" ADD CONSTRAINT "_ProfileTribes_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProfileTribes" ADD CONSTRAINT "_ProfileTribes_B_fkey"
    FOREIGN KEY ("B") REFERENCES "Tribe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "_ProfileSubCommunities" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProfileSubCommunities_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_ProfileSubCommunities_B_index" ON "_ProfileSubCommunities"("B");
ALTER TABLE "_ProfileSubCommunities" ADD CONSTRAINT "_ProfileSubCommunities_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProfileSubCommunities" ADD CONSTRAINT "_ProfileSubCommunities_B_fkey"
    FOREIGN KEY ("B") REFERENCES "SubCommunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "_ProfileRelationshipStyles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProfileRelationshipStyles_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_ProfileRelationshipStyles_B_index" ON "_ProfileRelationshipStyles"("B");
ALTER TABLE "_ProfileRelationshipStyles" ADD CONSTRAINT "_ProfileRelationshipStyles_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProfileRelationshipStyles" ADD CONSTRAINT "_ProfileRelationshipStyles_B_fkey"
    FOREIGN KEY ("B") REFERENCES "RelationshipStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
