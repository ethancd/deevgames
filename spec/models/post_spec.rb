require 'spec_helper'

describe Post do

  before(:all) do
    FactoryGirl.create(:user) unless User.first
  end

  it "has a valid factory" do
    FactoryGirl.create(:post).should be_valid
  end

  it "is invalid without an author" do
    FactoryGirl.build(:post, author_id: nil).should_not be_valid
  end

  it "is invalid without a title" do
    FactoryGirl.build(:post, title: nil).should_not be_valid
  end

  it "is invalid without a body" do
    FactoryGirl.build(:post, body: nil).should_not be_valid
  end
end
