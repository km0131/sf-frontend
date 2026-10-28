/** スタッフ画面のデータのキャッシュキー。 */
export const staffKeys = {
  active: (slug: string) => ['staff', slug, 'orders', 'active'] as const,
  done: (slug: string) => ['staff', slug, 'orders', 'done'] as const,
  menu: (slug: string) => ['staff', slug, 'menu'] as const,
  discounts: (slug: string) => ['staff', slug, 'discounts'] as const,
}
