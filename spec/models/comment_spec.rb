require 'spec_helper'

describe Comment do

  before(:all) do
    FactoryGirl.create(:user) unless User.first
    FactoryGirl.create(:post) unless Post.first
  end

  it "has a valid factory" do
    FactoryGirl.create(:comment).should be_valid
  end

  it "is invalid without an author" do
    FactoryGirl.build(:comment, author_id: nil).should_not be_valid
  end

  it "is invalid without a topic" do
    FactoryGirl.build(:comment, topic_id: nil).should_not be_valid
    FactoryGirl.build(:comment, topic_type: nil).should_not be_valid
  end

  it "is invalid without a body" do
    FactoryGirl.build(:comment, body: nil).should_not be_valid
  end

  it "is invalid with a huge body" do
    FactoryGirl.build(:comment, body: "lorem "*201).should_not be_valid
  end

end