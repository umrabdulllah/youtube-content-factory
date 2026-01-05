export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  color: string
  icon: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CategoryWithStats extends Category {
  channelCount: number
  projectCount: number
}

export interface CreateCategoryInput {
  name: string
  description?: string
  color?: string
  icon?: string
}

export interface UpdateCategoryInput {
  id: string
  name?: string
  description?: string
  color?: string
  icon?: string
  sortOrder?: number
}
