import { SupabaseClient } from "@/lib/supabase";
import { Category } from "@/types";

export class CategoriesRepository {
  private table = "categories" as const;

  constructor(private supabase: SupabaseClient) {}

  async findByName(name: string): Promise<Category | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select("*")
      .eq("name", name)
      .maybeSingle();

    if (error) throw error;
    return data as Category | null;
  }

  async create(
    category: Omit<Category, "id" | "createdAt" | "updatedAt">
  ): Promise<Category> {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert({
        ...category,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as Category;
  }

  async findOrCreate(
    name: string,
    description: string = "",
    parentId?: number
  ): Promise<Category> {
    let category = await this.findByName(name);

    if (!category) {
      category = await this.create({
        name,
        description,
        parent_id: parentId ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return category;
  }

  async findAll(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select("*")
      .order("name");

    if (error) throw error;
    return data as Category[];
  }
}
