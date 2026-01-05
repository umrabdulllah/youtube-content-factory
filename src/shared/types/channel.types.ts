export interface ChannelSettings {
  voiceId?: string
  voiceSpeed?: number
  imageStyle?: string
  imageModel?: string
  language?: string
  customPrompts?: {
    imagePrefix?: string
    imageSuffix?: string
  }
}

export interface Channel {
  id: string
  categoryId: string
  name: string
  slug: string
  description?: string
  defaultSettings: ChannelSettings
  projectCount: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ChannelWithCategory extends Channel {
  categoryName: string
  categoryColor: string
}

export interface CreateChannelInput {
  categoryId: string
  name: string
  description?: string
  defaultSettings?: ChannelSettings
}

export interface UpdateChannelInput {
  id: string
  name?: string
  description?: string
  defaultSettings?: ChannelSettings
}
