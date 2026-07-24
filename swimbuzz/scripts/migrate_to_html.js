const { PrismaClient } = require('@prisma/client');
const { generateHTML } = require('@tiptap/html');
const StarterKit = require('@tiptap/starter-kit').default;
const Underline = require('@tiptap/extension-underline').default;
const Link = require('@tiptap/extension-link').default;

const prisma = new PrismaClient();

// Minimal markdown to HTML converter using Tiptap's extensions since we can't easily import the complex parser
// This is a simplified approach, for production use a more robust converter
function markdownToHtml(markdown) {
  if (!markdown) return '';
  // Basic markdown to html placeholders
  return markdown
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .split('\n').map(line => line.startsWith('- ') ? `<li>${line.slice(2)}</li>` : `<p>${line}</p>`).join('');
}

async function migrate() {
    console.log('Starting migration...');

    const sets = await prisma.practiceSet.findMany();
    console.log(`Found ${sets.length} practice sets to migrate.`);

    for (const set of sets) {
        if (set.content && !set.content.startsWith('<')) {
            const html = markdownToHtml(set.content);
            await prisma.practiceSet.update({
                where: { id: set.id },
                data: { content: html }
            });
            console.log(`Migrated set ${set.id}`);
        }
        if (set.notes && !set.notes.startsWith('<')) {
          const html = markdownToHtml(set.notes);
          await prisma.practiceSet.update({
              where: { id: set.id },
              data: { notes: html }
          });
          console.log(`Migrated notes for set ${set.id}`);
        }
    }

    const practices = await prisma.practice.findMany();
    console.log(`Found ${practices.length} practices to migrate.`);
    for (const practice of practices) {
      if (practice.focus && !practice.focus.startsWith('<')) {
        const html = markdownToHtml(practice.focus);
        await prisma.practice.update({
            where: { id: practice.id },
            data: { focus: html }
        });
        console.log(`Migrated focus for practice ${practice.id}`);
      }
    }

    console.log('Migration complete.');
}

migrate()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
