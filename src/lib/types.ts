export interface Product {
  id: string;
  name: string;
}

export interface TestData {
  ply: string;
  gsm: string;
  burstingStrength: string;
  cobbValue: string;
  moistureContent: string;
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
