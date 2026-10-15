import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Phase 2 data...');

  // ─── Cities ─────────────────────────────────────────────────────────────────
  const pune = await prisma.city.upsert({
    where: { name: 'Pune' },
    update: {},
    create: { name: 'Pune', state: 'Maharashtra', isActive: true },
  });
  console.log(`City: ${pune.name} (${pune.id})`);

  // Areas for Pune — key neighbourhoods
  const puneAreas = [
    'Koregaon Park', 'Baner', 'Viman Nagar', 'Kothrud', 'Hinjewadi',
    'Hadapsar', 'Wakad', 'Aundh', 'Shivajinagar', 'Camp',
    'Kalyani Nagar', 'Magarpatta', 'Kharadi', 'Pimple Saudagar', 'Yerawada',
    'Deccan', 'Swargate', 'Bavdhan', 'Sus', 'Warje',
  ];

  for (const name of puneAreas) {
    await prisma.area.upsert({
      where: { cityId_name: { cityId: pune.id, name } },
      update: {},
      create: { cityId: pune.id, name, isActive: true },
    });
  }
  console.log(`Created ${puneAreas.length} areas for Pune`);

  // ─── Interest categories + interests ────────────────────────────────────────
  const interestData = [
    {
      name: 'Sports',
      order: 1,
      interests: ['Badminton', 'Cricket', 'Football', 'Basketball', 'Running', 'Cycling'],
    },
    {
      name: 'Social',
      order: 2,
      interests: ['Brunch', 'Pub Night', 'Cafe', 'Dinner', 'Board Games'],
    },
    {
      name: 'Adventure',
      order: 3,
      interests: ['Trekking', 'Camping', 'Hiking', 'Road Trips'],
    },
    {
      name: 'Creative',
      order: 4,
      interests: ['Photography', 'Painting', 'Music', 'Dance'],
    },
    {
      name: 'Fun',
      order: 5,
      interests: ['Karaoke', 'Bar Hopping', 'Escape Rooms', 'Comedy Night', 'Game Night'],
    },
    {
      name: 'Entertainment',
      order: 6,
      interests: ['Movies', 'Stand-up Comedy', 'Concerts', 'Gaming'],
    },
  ];

  for (const cat of interestData) {
    const category = await prisma.interestCategory.upsert({
      where: { name: cat.name },
      update: { displayOrder: cat.order },
      create: { name: cat.name, displayOrder: cat.order, isActive: true },
    });

    for (let i = 0; i < cat.interests.length; i++) {
      const interestName = cat.interests[i];
      await prisma.interest.upsert({
        where: { categoryId_name: { categoryId: category.id, name: interestName } },
        update: { displayOrder: i },
        create: {
          categoryId: category.id,
          name: interestName,
          displayOrder: i,
          isActive: true,
        },
      });
    }
    console.log(`Category: ${cat.name} (${cat.interests.length} interests)`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
