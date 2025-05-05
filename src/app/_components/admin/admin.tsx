
import { Tabs, TabsContent, TabsTrigger, TabsList } from "~/components/ui/tabs";
import AdminQuestions from "./admin-questions";
import { AddQuestion } from "./add-question";
import AdminTags from "./admin-tags";

export default function Admin() {
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="questions">Questions</TabsTrigger>
        <TabsTrigger value="add">Add Question</TabsTrigger>
        <TabsTrigger value="tags">Tags</TabsTrigger>
        <TabsTrigger value="prune">Prune</TabsTrigger>
      </TabsList>
      <TabsContent value="questions">
        <AdminQuestions />
      </TabsContent>
      <TabsContent value="add">
        <AddQuestion />
      </TabsContent>
      <TabsContent value="tags">
        <AdminTags />
      </TabsContent>
      <TabsContent value="prune">
        <span>Prune</span>
      </TabsContent>
    </Tabs>
  );
}
