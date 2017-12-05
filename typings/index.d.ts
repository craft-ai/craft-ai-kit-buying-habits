import * as CraftAi from 'craft-ai'

declare namespace Intelware {
  export namespace Dictionary {
    interface Category {
      [id: string]: Type.Category
    }

    interface Mapping {
      [id: string]: Type.Mapping
    }

    interface Client {
      [id: string]: Type.Client
    }
  }

  export namespace Type {
    interface Category {
      id: string
      name?: string
    }

    interface Mapping {
      num1: string
      num2: string
      brand: string
      subCat: string
    }

    interface Client {
      id: string
      name?: string
    }

    interface Article {
      productId: string
      brand: string
      categoryId: string
      quantity: number
      price: number
    }

    interface Order{
      id: string
      date: Date
      clientId: string
      articles: Article[]
    }
  }

  export interface KitConfiguration {
    token: string
    clients?: Dictionary.Client
    categories?: Dictionary.Category
  }

  export interface KitInternal {
    client: CraftAi.Client
    clients: Dictionary.Client
    categories: Dictionary.Category
  }

  export interface Query {
    categories: string[][]
    brand?: string
    levelOfInterest: string
    from: Date
    to?: Date
  }

  export interface FormattedQuery {
    categoryId: string
    from: number
    to: number
  }


  export interface RequestResult {
    name: string
    result: Intelware.QueryArrayResults
  }

  export interface QueryResult {
    clientId: string
    confidence: number
  }

  export interface QueryResults {
    query: FormattedQuery,
    results: Intelware.QueryResult[]
  }

  export interface QueryArrayResults {
    query: FormattedQuery[],
    results: Intelware.QueryResult[]
  }

  export interface Kit extends KitInternal {
    destroy(): Promise<void>
    request(categories: string[][], brand: string, to: Date, from: Date, levelOfInterest: string): Promise<RequestResult[]>
    update(orders: Type.Order[], type: string): Promise<any>
  }

  export function create(configuration: KitConfiguration): Kit
}
