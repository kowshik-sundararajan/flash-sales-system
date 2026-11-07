import type { Collection, Db } from "mongodb";
import type { Sale } from "../models/sale.model.js";

export const SALES_COLLECTION_NAME = "sales";

export type SaleDocument = Omit<Sale, "id"> & { _id: string };

export interface SalesRepository {
  findById(id: string): Promise<Sale | null>;
}

function toSale({ _id, product, stock, startsAt, endsAt }: SaleDocument): Sale {
  return {
    id: _id,
    product,
    stock,
    startsAt,
    endsAt,
  };
}

export class MongoSalesRepository implements SalesRepository {
  private readonly sales: Collection<SaleDocument>;

  constructor(db: Db) {
    this.sales = db.collection(SALES_COLLECTION_NAME);
  }

  async findById(id: string): Promise<Sale | null> {
    const doc = await this.sales.findOne({ _id: id });
    return doc ? toSale(doc) : null;
  }
}
