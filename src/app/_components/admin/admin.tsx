
import { Tabs, TabsContent, TabsTrigger, TabsList } from "~/components/ui/tabs";
import AdminQuestions from "./admin-questions";

export default function Admin() {
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="questions">Questions</TabsTrigger>
        <TabsTrigger value="tags">Tags</TabsTrigger>
        <TabsTrigger value="prune">Prune</TabsTrigger>
      </TabsList>
      <TabsContent value="questions">
        <AdminQuestions />
      </TabsContent>
      <TabsContent value="tags">
        <span>Tags</span>
      </TabsContent>
      <TabsContent value="prune">
        <span>Prune</span>
      </TabsContent>
    </Tabs>
  );
}
