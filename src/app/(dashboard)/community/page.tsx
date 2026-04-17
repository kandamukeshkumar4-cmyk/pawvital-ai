"use client";

import { useState } from "react";
import { Plus, Heart, MessageCircle, Search } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import Modal from "@/components/ui/modal";

interface Post {
  id: string;
  author: string;
  authorPet: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  comments: number;
  timeAgo: string;
  liked: boolean;
}

const categories = [
  { value: "all", label: "All Topics" },
  { value: "senior_care", label: "Senior Dog Care" },
  { value: "nutrition", label: "Nutrition" },
  { value: "behavior", label: "Behavior" },
  { value: "health", label: "Health" },
  { value: "general", label: "General" },
];

const categoryColors: Record<string, string> = {
  senior_care: "bg-purple-100 text-purple-700",
  nutrition: "bg-green-100 text-green-700",
  behavior: "bg-blue-100 text-blue-700",
  health: "bg-red-100 text-red-700",
  general: "bg-gray-100 text-gray-700",
};

const initialPosts: Post[] = [
  {
    id: "1",
    author: "Sarah M.",
    authorPet: "Cooper, Golden Retriever",
    title: "Cooper's mobility improved so much in 3 months!",
    content:
      "I started the Glucosamine + Omega-3 combo that PawVital recommended and I can't believe the difference. Cooper is getting up easier, walking longer, and even tried to play fetch yesterday! For anyone with a senior dog struggling with joints, please try this combination. It changed everything for us.",
    category: "senior_care",
    likes: 47,
    comments: 12,
    timeAgo: "2 hours ago",
    liked: false,
  },
  {
    id: "2",
    author: "Michelle T.",
    authorPet: "Buddy, Beagle Mix",
    title: "Best food for a 13-year-old with sensitive stomach?",
    content:
      "Buddy has been having digestive issues lately and I'm looking for recommendations. He's on FortiFlora already but wondering if anyone has found a specific food brand that works well for senior dogs with sensitive stomachs. He's 13 and a beagle mix.",
    category: "nutrition",
    likes: 23,
    comments: 18,
    timeAgo: "5 hours ago",
    liked: true,
  },
  {
    id: "3",
    author: "Jessica R.",
    authorPet: "Luna, Labrador",
    title: "The symptom checker saved us a trip to the ER",
    content:
      "Luna started acting weird last night - pacing, panting, wouldn't settle down. I was about to rush to the emergency vet ($$$) but checked the symptom checker first. It identified it as likely storm anxiety (there was a thunderstorm coming) and suggested the calming protocol. Within 30 minutes of following the steps, Luna was asleep. Would have been an $800 ER visit for nothing!",
    category: "health",
    likes: 89,
    comments: 24,
    timeAgo: "1 day ago",
    liked: false,
  },
  {
    id: "4",
    author: "Karen L.",
    authorPet: "Max, German Shepherd",
    title: "Senior dog separation anxiety tips?",
    content:
      "Max is 10 and has recently developed separation anxiety. He never had this before. He whines, barks, and has started chewing things when we leave. Any tips from other senior dog parents? We're already using the calming supplements PawVital recommended.",
    category: "behavior",
    likes: 34,
    comments: 15,
    timeAgo: "2 days ago",
    liked: false,
  },
  {
    id: "5",
    author: "Lisa P.",
    authorPet: "Daisy, Poodle",
    title: "Sharing Daisy's monthly wellness report - so proud!",
    content:
      "Daisy's health score went from 62 to 88 in just 4 months! The combination of the supplement plan, better food, and consistent exercise routine has been incredible. Sharing because I want other dog parents to know it really does work if you stick with it.",
    category: "general",
    likes: 112,
    comments: 31,
    timeAgo: "3 days ago",
    liked: true,
  },
];

export default function CommunityPage() {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState("all");
  const [showNewPost, setShowNewPost] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    category: "general",
  });

  const toggleLike = (id: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              liked: !p.liked,
              likes: p.liked ? p.likes - 1 : p.likes + 1,
            }
          : p,
      ),
    );
  };

  const addPost = (e: React.FormEvent) => {
    e.preventDefault();
    const post: Post = {
      id: crypto.randomUUID(),
      author: "You",
      authorPet: "Cooper, Golden Retriever",
      title: newPost.title,
      content: newPost.content,
      category: newPost.category,
      likes: 0,
      comments: 0,
      timeAgo: "Just now",
      liked: false,
    };
    setPosts((prev) => [post, ...prev]);
    setShowNewPost(false);
    setNewPost({ title: "", content: "", category: "general" });
  };

  const filtered = posts.filter((p) => {
    const matchesCategory = filter === "all" || p.category === filter;
    const matchesSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Paw Circle</h1>
          <p className="text-gray-500 mt-1">Connect with fellow dog parents</p>
        </div>
        <Button
          onClick={() => setShowNewPost(true)}
          className="w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" /> New Post
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">2,847</p>
          <p className="text-xs text-gray-500">Community Members</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">156</p>
          <p className="text-xs text-gray-500">Posts This Week</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">94%</p>
          <p className="text-xs text-gray-500">Helpful Rate</p>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search discussions..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === cat.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {filtered.map((post) => (
          <Card
            key={post.id}
            className="p-4 transition-shadow hover:shadow-md sm:p-6"
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-blue-600">
                  {post.author.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">
                    {post.author}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">
                    {post.authorPet}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">{post.timeAgo}</span>
                </div>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${categoryColors[post.category] || categoryColors.general}`}
                >
                  {categories.find((c) => c.value === post.category)?.label ||
                    post.category}
                </span>
                <h3 className="font-bold text-gray-900 mt-2">{post.title}</h3>
                <p className="text-gray-600 mt-2 text-sm leading-relaxed line-clamp-3">
                  {post.content}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                      post.liked
                        ? "text-red-500"
                        : "text-gray-400 hover:text-red-500"
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${post.liked ? "fill-red-500" : ""}`}
                    />
                    {post.likes}
                  </button>
                  <button className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-500 transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    {post.comments}
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* New Post Modal */}
      <Modal
        isOpen={showNewPost}
        onClose={() => setShowNewPost(false)}
        title="Create Post"
        size="lg"
      >
        <form onSubmit={addPost} className="space-y-4">
          <Input
            label="Title"
            value={newPost.title}
            onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
            placeholder="What's on your mind?"
            required
          />
          <Select
            label="Category"
            value={newPost.category}
            onChange={(e) =>
              setNewPost({ ...newPost, category: e.target.value })
            }
            options={categories.filter((c) => c.value !== "all")}
          />
          <Textarea
            label="Content"
            value={newPost.content}
            onChange={(e) =>
              setNewPost({ ...newPost, content: e.target.value })
            }
            placeholder="Share your experience, ask a question, or offer advice..."
            rows={6}
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowNewPost(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Post</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
