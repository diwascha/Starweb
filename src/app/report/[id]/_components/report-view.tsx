'use client';

import { useEffect, useState, useRef } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Printer, Lightbulb } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export default function ReportView({ reportId }: { reportId: string }) {
  const [reports] = useLocalStorage<Report[]>('reports', []);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const foundReport = reports.find(r => r.id === reportId);
    setReport(foundReport || null);
  }, [reportId, reports]);

  const handlePrint = () => {
    window.print();
  };

  if (!report) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Report not found or is loading...</p>
      </div>
    );
  }

  const chartData = Object.entries(report.testData).map(([key, value]) => ({
    name: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
    value: parseFloat(value) || 0,
  }));
  
  const formatLabel = (key: string) => {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const renderChart = () => {
    if (!report.visualization) return null;

    const { visualizationType } = report.visualization;

    switch (visualizationType.toLowerCase().trim()) {
      case 'bar chart':
        const barChartConfig: ChartConfig = {
          value: { label: 'Value', color: 'hsl(var(--chart-1))' },
        };
        return (
          <ChartContainer config={barChartConfig} className="min-h-[200px] w-full">
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          </ChartContainer>
        );
      case 'pie chart':
        const pieChartConfig = chartData.reduce((acc, entry, index) => {
          acc[entry.name] = {
            label: entry.name,
            color: `hsl(var(--chart-${(index % 5) + 1}))`,
          };
          return acc;
        }, {} as ChartConfig);

        return (
          <ChartContainer config={pieChartConfig} className="mx-auto aspect-square max-h-[300px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                {chartData.map(entry => (
                  <Cell key={`cell-${entry.name}`} fill={`var(--color-${entry.name})`} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        );
      default:
        const defaultChartConfig: ChartConfig = {
          value: { label: 'Value', color: 'hsl(var(--chart-1))' },
        };
        return (
            <ChartContainer config={defaultChartConfig} className="min-h-[200px] w-full">
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          </ChartContainer>
        );
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-8 print:hidden">
        <h1 className="text-3xl font-bold">Test Report</h1>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Export PDF
        </Button>
      </div>

      <div className="printable-area">
        <Card>
          <CardHeader>
            <CardTitle>{report.product.name} - Test Report</CardTitle>
            <CardDescription>Generated on {new Date(report.date).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <section>
                <h2 className="text-xl font-semibold mb-2">Product Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="font-medium text-muted-foreground">Product Name: </span>
                        <span>{report.product.name}</span>
                    </div>
                    <div>
                        <span className="font-medium text-muted-foreground">Material Code: </span>
                        <span>{report.product.materialCode}</span>
                    </div>
                    <div>
                        <span className="font-medium text-muted-foreground">Company: </span>
                        <span>{report.product.companyName}</span>
                    </div>
                    <div>
                        <span className="font-medium text-muted-foreground">Address: </span>
                        <span>{report.product.address}</span>
                    </div>
                </div>
            </section>
            <section>
              <h2 className="text-xl font-semibold mb-2">Test Parameters & Results</h2>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Standard</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(report.product.specification).map((key) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">
                          {formatLabel(key)}
                        </TableCell>
                        <TableCell>{report.product.specification[key as keyof typeof report.product.specification]}</TableCell>
                        <TableCell>{report.testData[key as keyof typeof report.testData]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {report.visualization && (
              <section>
                <h2 className="text-xl font-semibold mb-2">Data Visualization</h2>
                <Card>
                  <CardHeader>
                    <CardTitle>{report.visualization.visualizationType}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full h-80 flex justify-center items-center">
                      {renderChart()}
                    </div>
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg flex items-start gap-3">
                      <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="font-semibold">AI Reasoning</h4>
                        <p className="text-sm text-muted-foreground">{report.visualization.reasoning}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-area,
          .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .printable-area .shadow-lg, .printable-area .shadow-sm {
            box-shadow: none !important;
          }
           .printable-area .border {
            border: 1px solid #ccc !important;
          }
        }
      `}</style>
    </>
  );
}
