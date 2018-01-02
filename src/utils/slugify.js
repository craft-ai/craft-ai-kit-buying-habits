export default function slugify(...strings) {
  return strings.join(' ').replace(/[^A-Za-z0-9]+/g, '-');
}