export interface SeedTable {
  schemaName: string;
  tableName: string;
}

export interface SeedColumn {
  columnName: string;
  dataType: string;
  udtSchema: string;
  udtName: string;
  isNullable: boolean;
  hasDefault: boolean;
  isIdentity: boolean;
  isGenerated: boolean;
}

export interface ForeignKeyReference {
  columnName: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
}

export interface SeedTableMetadata extends SeedTable {
  columns: SeedColumn[];
  foreignKeys: ForeignKeyReference[];
  checkDefinitions: string[];
}
