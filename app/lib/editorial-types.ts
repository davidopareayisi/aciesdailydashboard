export const articleCategories = ["News", "Entertainment", "Lifestyle", "Business"] as const;
export type ArticleContent = {
  title: string; summary: string; body: string; category: typeof articleCategories[number];
  author: string; imageId: string; imageAlt: string; imageCredit: string;
  sponsor: string; sponsorUrl: string; correction: string;
};
export type PublishedArticle = ArticleContent & { id: string; slug: string; publishedAt: string; updatedAt: string };
export type Article = ArticleContent & {
  id: string; slug: string; userId: string; revision: number; createdAt: string; updatedAt: string;
  status: "Draft" | "In review" | "Published" | "Scheduled";
  published: PublishedArticle | null;
};
