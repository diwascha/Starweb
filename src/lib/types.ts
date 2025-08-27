export interface Product {
  id: string;
  name: string;
  materialCode: string;
  companyName: string;
  address: string;
}

export interface TestData {
  dimension: string;
  ply: string;
  gsm: string;
  stapleWidth: string;
  stapling: string;
  overlapWidth: string;
  printing: string;
  moisture: string;
  load: string;
}

export interface Report {
  id: string;
  product: Product;
  date: string;
  testData: TestData;
  visualization?: {
    visualizationType: string;
    reasoning: string;
  };
}
