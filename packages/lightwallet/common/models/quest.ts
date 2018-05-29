export class Quest {
  constructor(
    slug: string,
    name: string,
    description: string,
    image: string,
    conditions: Array<{ name: string }>,
    version: number
  ) {}
}

export interface Quests {
  quests: Quest[];
}
