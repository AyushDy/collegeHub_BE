const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    url:   { type: String, required: true },
    type:  { type: String, enum: ["video", "article", "docs", "book", "course"], required: true },
  },
  { _id: false }
);

// A single node in the flowchart graph
const nodeSchema = new mongoose.Schema(
  {
    id:                { type: String, required: true },   // unique within this roadmap
    type:              { type: String, enum: ["start", "topic", "project", "milestone", "end"], required: true },
    label:             { type: String, required: true },   // short display name
    description:       { type: String, default: "" },      // detailed explanation
    phase:             { type: Number, default: null },     // grouping / swim-lane
    resources:         { type: [resourceSchema], default: [] },
    estimatedDuration: { type: String, default: null },
  },
  { _id: false }
);

// A directed edge between two nodes
const edgeSchema = new mongoose.Schema(
  {
    from:  { type: String, required: true },  // node id
    to:    { type: String, required: true },  // node id
    label: { type: String, default: "" },      // optional edge annotation
  },
  { _id: false }
);

const roadmapGraphSchema = new mongoose.Schema(
  {
    skill:         { type: String, required: true },
    overview:      { type: String, default: "" },
    totalDuration: { type: String, default: "" },
    nodes:         { type: [nodeSchema], default: [] },
    edges:         { type: [edgeSchema], default: [] },
    tips:          { type: [String], default: [] },
  },
  { _id: false }
);

const roadmapSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    skill: {
      type: String,
      required: true,
      trim: true,
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    goal: {
      type: String,
      trim: true,
    },
    roadmap: {
      type: roadmapGraphSchema,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Roadmap", roadmapSchema);
