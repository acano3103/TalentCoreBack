import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const sitios = await prisma.catSites.findMany({
  select: { idSite: true, Descripcion: true, zonaHoraria: true },
  take: 40,
});
console.log(JSON.stringify(sitios, null, 2));
await prisma.$disconnect();
