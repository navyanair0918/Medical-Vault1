import mongoose from 'mongoose';

export async function connectDB()
{
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medical_vault';
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
